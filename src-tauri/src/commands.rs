use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;

use crate::config;
use crate::debug;
use crate::game;
use crate::inject;
use crate::injector;
use crate::install;
use crate::keys;
use crate::loader;
use crate::mods;
use crate::paths;
use crate::spawn;

pub type CmdResult<T> = Result<T, String>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub game_exe: String,
    pub resources_ok: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub game_path: Option<String>,
    pub installed: bool,
    /// 加载器当前是否已注入游戏目录
    pub injected: bool,
    /// 3DMigoto 是否已真正加载进游戏进程（注入成功）
    pub mod_loaded: bool,
    /// 游戏目录里是否残留旧版常驻部署的加载器文件
    pub legacy_resident: bool,
    pub game_running: bool,
    pub installed_at: Option<u64>,
    pub nsmmi_version: Option<String>,
    /// 当前生效的加载器版本（无网络查询，直接读配置/随包版本）
    pub loader_version: String,
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        game_exe: game::GAME_EXE.to_string(),
        resources_ok: paths::resources_dir(&app).join("Loader").is_dir(),
    }
}

#[tauri::command]
pub fn get_status(app: AppHandle) -> Status {
    let cfg = config::load(&app);
    let game_path = cfg.game_path.filter(|p| !p.is_empty());
    let root = PathBuf::from(game_path.clone().unwrap_or_default());
    let manifest = install::read_manifest(&app);

    // 注入状态来自注入器：只有「游戏在跑 + 注入成功」才算已注入
    let injected = inject::is_active();
    let game_running = game::is_game_running();
    Status {
        installed: install::is_installed(&app, &root),
        injected,
        // 只有游戏在跑时才枚举进程模块，避免空转
        mod_loaded: injected
            && game_running
            && game::is_loader_loaded(&paths::loader_dir(&app).join(inject::LOADER_DLL)),
        legacy_resident: !injected && inject::has_resident_files(&root),
        game_running,
        installed_at: manifest.as_ref().map(|m| m.installed_at),
        nsmmi_version: manifest.map(|m| m.nsmmi_version),
        loader_version: crate::loader::installed_version(&app),
        game_path,
    }
}

/// 自动定位游戏目录（上次记录 → 注册表 → 盘符扫描）
#[tauri::command]
pub fn detect_game(app: AppHandle) -> Option<String> {
    let cfg = config::load(&app);
    game::find_game_root(cfg.game_path.as_deref()).map(|p| p.to_string_lossy().to_string())
}

/// 弹出系统文件夹选择框
#[tauri::command]
pub fn pick_game_folder(app: AppHandle, start: Option<String>) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;

    let mut dialog = app.dialog().file();
    if let Some(dir) = start.filter(|s| !s.is_empty()) {
        dialog = dialog.set_directory(dir);
    }

    dialog
        .blocking_pick_folder()
        .and_then(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

/// 校验目录是否为合法游戏根目录
#[tauri::command]
pub fn validate_game_root(game_root: String) -> bool {
    game::is_valid_root(Path::new(&game_root))
}

#[tauri::command]
pub fn save_game_path(app: AppHandle, path: String) -> CmdResult<()> {
    config::save_game_path(&app, &path)
}

/// 当前自定义背景图路径
#[tauri::command]
pub fn get_wallpaper(app: AppHandle) -> Option<String> {
    config::load(&app)
        .wallpaper_path
        .filter(|p| !p.is_empty())
        .filter(|p| std::path::Path::new(p).is_file())
}

#[tauri::command]
pub fn set_wallpaper(app: AppHandle, path: Option<String>) -> CmdResult<()> {
    config::set_wallpaper(&app, path)
}

/// 界面设置（主题 + 字号 + 自动更新）
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UiSettings {
    pub theme: String,
    pub font_size: u8,
    pub auto_update: bool,
}

#[tauri::command]
pub fn get_ui_settings(app: AppHandle) -> UiSettings {
    let cfg = config::load(&app);
    UiSettings {
        theme: cfg.theme.unwrap_or_else(|| "light".to_string()),
        font_size: cfg.font_size.unwrap_or(14),
        auto_update: cfg.auto_update.unwrap_or(false),
    }
}

#[tauri::command]
pub fn set_ui_settings(
    app: AppHandle,
    theme: String,
    font_size: u8,
    auto_update: bool,
) -> CmdResult<()> {
    config::set_ui_settings(&app, &theme, font_size, auto_update)
}

/// 检查 3DMigoto 更新
#[tauri::command]
pub fn check_loader_update(app: AppHandle) -> CmdResult<loader::UpdateInfo> {
    loader::check(&app)
}

/// 在线更新 3DMigoto 加载器
#[tauri::command]
pub fn update_loader(app: AppHandle) -> CmdResult<Vec<String>> {
    loader::update(&app)
}

/// 3DMigoto 调试开关当前状态（读 d3dx.ini）
#[tauri::command]
pub fn get_debug_state(game_root: String) -> CmdResult<debug::DebugState> {
    debug::read_state(Path::new(&game_root))
}

/// 显隐调试悬浮窗
///
/// 必须为 async：同步命令运行在主线程，若在主线程里同步 build() 新窗口，
/// 会等待事件循环处理创建请求而事件循环正被本命令阻塞 → 整个应用死锁。
/// 因此把窗口创建放到后台线程，由其转发回主线程完成。
#[tauri::command]
pub async fn toggle_overlay(app: AppHandle) -> CmdResult<bool> {
    tauri::async_runtime::spawn_blocking(move || crate::overlay::toggle(&app))
        .await
        .map_err(|e| format!("悬浮窗任务失败: {}", e))?
}

/// 读取 3DMigoto 日志尾部（d3d11_log.txt 末尾若干行）
#[tauri::command]
pub fn read_loader_log(game_root: String, lines: Option<usize>) -> CmdResult<Vec<String>> {
    let _ = &game_root;
    let path = paths::d3m_dir().join("d3d11_log.txt");
    let take = lines.unwrap_or(40).min(400);

    // 只 seek 读取文件尾部 64KB：开启 calls 日志时文件每秒膨胀数 MB，
    // 整文件读入会拖死悬浮窗（未响应）。seek 读与文件总体积无关。
    const TAIL: u64 = 64 * 1024;
    let mut file = std::fs::File::open(&path)
        .map_err(|_| "未找到 d3d11_log.txt（需开启详细日志并在游戏内产生输出）".to_string())?;
    let len = file
        .metadata()
        .map_err(|e| format!("读取日志信息失败: {}", e))?
        .len();
    let start = len.saturating_sub(TAIL);
    file.seek(SeekFrom::Start(start))
        .map_err(|e| format!("读取日志失败: {}", e))?;
    let mut buf = Vec::with_capacity((len - start) as usize);
    file.read_to_end(&mut buf)
        .map_err(|e| format!("读取日志失败: {}", e))?;

    let tail = String::from_utf8_lossy(&buf);
    let mut out: Vec<String> = tail
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.to_string())
        .collect();
    // 从中间起读时首行大概率是半行，丢弃
    if start > 0 && !out.is_empty() {
        out.remove(0);
    }
    if out.len() > take {
        out = out.split_off(out.len() - take);
    }
    Ok(out)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DumpFile {
    pub name: String,
    pub size: u64,
    pub modified: Option<u64>,
    pub note: Option<String>,
}

fn notes_path(_game_root: &Path) -> std::path::PathBuf {
    paths::d3m_dir().join("ShaderFixes").join("_nsmmi_notes.json")
}

fn load_notes(game_root: &Path) -> std::collections::HashMap<String, String> {
    fs::read_to_string(notes_path(game_root))
        .ok()
        .and_then(|raw| serde_json::from_str::<std::collections::HashMap<String, String>>(&raw).ok())
        .unwrap_or_default()
}

/// 列出 ShaderFixes 下 3DMigoto 抓取的 dump 文件（shader .txt / 贴图 .dds）
#[tauri::command]
pub fn list_dumps(game_root: String) -> CmdResult<Vec<DumpFile>> {
    let root = Path::new(&game_root);
    let dir = paths::d3m_dir().join("ShaderFixes");
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let notes = load_notes(root);
    let mut out: Vec<DumpFile> = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("读取 ShaderFixes 失败: {}", e))?.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name == "_nsmmi_notes.json" || name == "example.hlsl" {
            continue;
        }
        let lower = name.to_lowercase();
        if !(lower.ends_with(".txt") || lower.ends_with(".dds")) {
            continue;
        }
        let meta = entry.metadata().ok();
        let modified = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());
        out.push(DumpFile {
            name: name.clone(),
            size: meta.map(|m| m.len()).unwrap_or(0),
            modified,
            note: notes.get(&name).cloned(),
        });
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified).then(a.name.cmp(&b.name)));
    Ok(out)
}

/// 为 dump 文件添加备注（模型命名），并按备注在 ShaderFixes 下创建归档文件夹
#[tauri::command]
pub fn save_model_note(game_root: String, file: String, note: String) -> CmdResult<Vec<DumpFile>> {
    let root = Path::new(&game_root);
    let note = note.trim().to_string();
    if note.is_empty() {
        return Err("备注不能为空".to_string());
    }
    if note.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
        return Err("备注不能包含 \\ / : * ? \" < > | 等字符".to_string());
    }

    let mut notes = load_notes(root);
    notes.insert(file.clone(), note.clone());
    let raw = serde_json::to_string_pretty(&notes).map_err(|e| format!("序列化备注失败: {}", e))?;
    fs::create_dir_all(paths::d3m_dir().join("ShaderFixes"))
        .map_err(|e| format!("创建 ShaderFixes 失败: {}", e))?;
    fs::write(notes_path(root), raw).map_err(|e| format!("写入备注失败: {}", e))?;

    // 按备注创建归档文件夹
    fs::create_dir_all(paths::d3m_dir().join("ShaderFixes").join(&note))
        .map_err(|e| format!("创建文件夹失败: {}", e))?;

    list_dumps(game_root)
}

/// 切换 3DMigoto 调试开关（hunting | logging）
#[tauri::command]
pub fn set_debug_option(
    game_root: String,
    option: String,
    enabled: bool,
) -> CmdResult<debug::DebugState> {
    debug::set_option(Path::new(&game_root), &option, enabled)
}

/// 向游戏发送一次按键（没有小键盘时的替代方案）
///
/// 内部含进程枚举与短暂等待，放到阻塞线程执行，避免卡住 UI 线程。
#[tauri::command]
pub async fn send_game_key(key: String) -> CmdResult<String> {
    tauri::async_runtime::spawn_blocking(move || keys::send_key(&key))
        .await
        .map_err(|e| format!("发送按键任务失败: {}", e))?
}

/// 壁纸标题栏区域（右上角）是否为浅色——是则前端用深色图标
#[tauri::command]
pub fn wallpaper_titlebar_light(app: AppHandle) -> bool {
    let Some(path) = config::load(&app).wallpaper_path else {
        return false;
    };
    let Ok(img) = image::open(&path) else {
        return false;
    };

    // 采样标题栏覆盖的区域：宽度右 40%、高度前 6%（即右上角）
    let (width, height) = (img.width(), img.height());
    let x_from = (width as f32 * 0.6) as u32;
    let x_to = width;
    let y_to = ((height as f32 * 0.06) as u32).max(1);

    let mut total = 0.0f64;
    let mut count = 0u64;
    for (x, y, pixel) in img.to_rgba8().enumerate_pixels() {
        if x < x_from || x >= x_to || y >= y_to {
            continue;
        }
        let (r, g, b) = (
            pixel[0] as f64,
            pixel[1] as f64,
            pixel[2] as f64,
        );
        total += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        count += 1;
    }
    if count == 0 {
        return false;
    }
    total / count as f64 > 150.0
}

/// 弹出系统文件选择框挑选背景图
#[tauri::command]
pub fn pick_wallpaper(app: AppHandle) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;

    let picked = app
        .dialog()
        .file()
        .add_filter("图片", &["jpg", "jpeg", "png", "webp", "bmp"])
        .blocking_pick_file();

    picked
        .and_then(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn install(app: AppHandle, game_root: String) -> CmdResult<Vec<String>> {
    install::install(&app, Path::new(&game_root))
}

#[tauri::command]
pub fn uninstall(app: AppHandle, game_root: String) -> CmdResult<Vec<String>> {
    let mut log = inject::stop();
    log.extend(install::uninstall(&app, Path::new(&game_root))?);
    Ok(log)
}

/// 启动游戏（注入 3DMigoto，游戏退出后自动释放）
///
/// 未准备加载器时自动先准备一次（免去手动点「安装 / 更新」）；
/// 启动方式与超时取自设置；内部含轮询等待，放到阻塞线程执行。
#[tauri::command]
pub async fn launch_game(app: AppHandle, game_root: String) -> CmdResult<install::LaunchOutcome> {
    let (mode, timeout) = config::launch_settings(&app);
    let launch_mode = install::LaunchMode::parse(&mode);
    // 「直接启动」带 `-ngp` 即可，不需要管理员权限；
    // 只有经官方启动器（NGP 清单要求 requireAdministrator）时才必须提权。
    if !spawn::is_elevated() && matches!(launch_mode, install::LaunchMode::Launcher | install::LaunchMode::Shell)
    {
        return Err(
            "「启动器 / Shell」方式需要管理员权限（NGP\\LootHoarder.exe 要求提权，它拉起的游戏也是提权进程）。\
             可以改用「直接启动」，或点「设置 - 启动」里的「以管理员身份重启」。"
                .to_string(),
        );
    }
    let loader_dir = paths::loader_dir(&app);
    let inject_mode = injector::InjectMode::parse(&config::inject_mode(&app));
    let prep_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(&game_root);
        let mut prep: Vec<String> = Vec::new();
        if !install::is_installed(&prep_app, root) {
            prep.push("首次启动：自动准备加载器".to_string());
            prep.extend(install::install(&prep_app, root)?);
        }
        let mut outcome =
            install::launch_game(root, &loader_dir, launch_mode, inject_mode, timeout)?;
        prep.extend(outcome.lines);
        outcome.lines = prep;
        Ok(outcome)
    })
    .await
    .map_err(|e| format!("启动游戏任务失败: {}", e))?
}

/// 取消注入：清掉注入状态，并清理旧版留在游戏目录里的加载器
#[tauri::command]
pub fn restore_loader(game_root: String) -> CmdResult<Vec<String>> {
    let mut log = inject::stop();
    log.extend(inject::cleanup_legacy(Path::new(&game_root)));
    Ok(log)
}

/// 读取启动设置（方式 + 超时）
#[tauri::command]
pub fn get_launch_settings(app: AppHandle) -> (String, u64) {
    config::launch_settings(&app)
}

#[tauri::command]
pub fn set_launch_settings(app: AppHandle, mode: String, timeout: u64) -> CmdResult<()> {
    config::set_launch_settings(&app, &mode, timeout)
}

/// 读取注入方式（direct | hook）
#[tauri::command]
pub fn get_inject_mode(app: AppHandle) -> String {
    config::inject_mode(&app)
}

#[tauri::command]
pub fn set_inject_mode(app: AppHandle, mode: String) -> CmdResult<()> {
    config::set_inject_mode(&app, &mode)
}

/// 注入器信息（名称 + 两种方式是否可用），用于设置页展示
#[tauri::command]
pub fn get_injector_info(app: AppHandle) -> serde_json::Value {
    let loader_dir = paths::loader_dir(&app);
    let resolved = injector::resolve(&loader_dir);
    let (name, path, is_ours) = match resolved {
        Some((path, ours)) => (
            if ours { "H3DLoader" } else { "3dmloader" }.to_string(),
            path.to_string_lossy().to_string(),
            ours,
        ),
        None => (String::new(), String::new(), false),
    };
    serde_json::json!({
        "name": name,
        "path": path,
        "isOurs": is_ours,
        "supportsHook": is_ours,
        "supportsDirect": !name.is_empty(),
        "diagnostics": injector::diagnostics(&loader_dir).map(|(stage, calls, error)| {
            serde_json::json!({ "stage": stage, "calls": calls, "lastError": error })
        }),
    })
}

/// 在文件管理器中打开游戏目录下的 Mod
#[tauri::command]
pub fn open_mods_dir(app: AppHandle, game_root: String) -> CmdResult<()> {
    let dir = mods::mods_dir(Path::new(&game_root));
    if !dir.is_dir() {
        return Err("Mod 目录不存在，请先安装".to_string());
    }
    open_dir(&app, &dir)
}

/// 在文件管理器中打开游戏目录下的 ShaderFixes
#[tauri::command]
pub fn open_shaderfixes_dir(app: AppHandle, game_root: String) -> CmdResult<()> {
    let dir = mods::shaderfixes_dir(Path::new(&game_root));
    if !dir.is_dir() {
        return Err("ShaderFixes 目录不存在，请先安装".to_string());
    }
    open_dir(&app, &dir)
}

/// 在文件管理器中打开任意目录
#[tauri::command]
pub fn open_folder(app: AppHandle, path: String) -> CmdResult<()> {
    let dir = PathBuf::from(path);
    if !dir.is_dir() {
        return Err(format!("目录不存在: {}", dir.display()));
    }
    open_dir(&app, &dir)
}

#[tauri::command]
pub fn list_mods(game_root: String) -> CmdResult<Vec<mods::ModInfo>> {
    mods::list_mods(Path::new(&game_root))
}

/// 在桌面创建「NSMMI 快速启动」快捷方式（双击即自动执行启动注入）
#[tauri::command]
pub fn create_desktop_shortcut() -> CmdResult<String> {
    crate::shortcut::create_desktop_shortcut()
}

#[tauri::command]
pub fn toggle_mod(game_root: String, name: String) -> CmdResult<Vec<mods::ModInfo>> {
    mods::toggle_mod(Path::new(&game_root), &name)
}

#[cfg(windows)]
fn open_dir(_app: &AppHandle, dir: &Path) -> CmdResult<()> {
    std::process::Command::new("explorer")
        .arg(dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("打开目录失败: {}", e))
}

#[cfg(not(windows))]
fn open_dir(app: &AppHandle, dir: &Path) -> CmdResult<()> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(dir, None::<&str>)
        .map_err(|e| format!("打开目录失败: {}", e))
}
