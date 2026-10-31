use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;

use crate::config;
use crate::debug;
use crate::game;
use crate::install;
use crate::loader;
use crate::mods;
use crate::paths;

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
    pub game_running: bool,
    pub installed_at: Option<u64>,
    pub nsmmi_version: Option<String>,
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
    let manifest = install::read_manifest(&root);

    Status {
        installed: install::is_installed(&root),
        game_running: game::is_game_running(),
        installed_at: manifest.as_ref().map(|m| m.installed_at),
        nsmmi_version: manifest.map(|m| m.nsmmi_version),
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

/// 切换 3DMigoto 调试开关（hunting | logging）
#[tauri::command]
pub fn set_debug_option(
    game_root: String,
    option: String,
    enabled: bool,
) -> CmdResult<debug::DebugState> {
    debug::set_option(Path::new(&game_root), &option, enabled)
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
pub fn uninstall(game_root: String) -> CmdResult<Vec<String>> {
    install::uninstall(Path::new(&game_root))
}

#[tauri::command]
pub fn launch_game(game_root: String) -> CmdResult<Vec<String>> {
    install::launch_game(Path::new(&game_root))
}

/// 在文件管理器中打开游戏目录下的 Mods
#[tauri::command]
pub fn open_mods_dir(app: AppHandle, game_root: String) -> CmdResult<()> {
    let dir = mods::mods_dir(Path::new(&game_root));
    if !dir.is_dir() {
        return Err("Mods 目录不存在，请先安装".to_string());
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
