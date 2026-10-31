use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::config;
use crate::game::{
    find_ngp_launcher, find_official_launcher, is_game_running, is_launcher_running,
    is_valid_root, GAME_EXE, NGP_ARG,
};
use crate::inject;
use crate::injector::InjectMode;
use crate::launcher_ui;
use crate::paths;
use crate::spawn;
use crate::window::focus_by_title_keyword;

/// 官方启动器窗口标题关键字（逆水寒手游桌面版启动器 / NGP 窗口标题）
const LAUNCHER_WINDOW_KEYWORD: &str = "逆水寒";

const NSMMI_DIR: &str = "_NSMMI";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub file: String,
    pub had_backup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub nsmmi_version: String,
    pub installed_at: u64,
    pub game_root: String,
    pub files: Vec<ManifestEntry>,
}

/// 准备记录放配置目录（`%APPDATA%\NSMMI\state.json`），游戏目录保持零文件
pub fn manifest_path(app: &AppHandle) -> PathBuf {
    paths::config_dir(app).join("state.json")
}

pub fn read_manifest(app: &AppHandle) -> Option<Manifest> {
    let raw = fs::read_to_string(manifest_path(app)).ok()?;
    serde_json::from_str::<Manifest>(&raw).ok()
}

/// 路径比较用：统一分隔符、去掉结尾分隔符、忽略大小写
fn same_path(a: &str, b: &Path) -> bool {
    let norm = |s: &str| {
        s.replace('/', "\\")
            .trim_end_matches('\\')
            .to_lowercase()
    };
    norm(a) == norm(&b.to_string_lossy())
}

/// 「已准备」= 存在准备记录且指向当前游戏目录
///
/// 兜底：早期版本把记录写在 `游戏目录\_NSMMI\` 且可能写失败，这里以
/// 「工作目录里的加载器文件是否齐全」作为等价判据，避免界面出现
/// 「文件都在却一直显示未准备」。
pub fn is_installed(app: &AppHandle, game_root: &Path) -> bool {
    match read_manifest(app) {
        Some(manifest) => same_path(&manifest.game_root, game_root),
        None => paths::loader_files_ready(),
    }
}

/// 准备注入式加载（参考 XXMI）
///
/// 3DMigoto 的 dll / d3dx.ini / Mod / ShaderFixes 全部放在 NSMMI 侧的工作目录，
/// 启动游戏时把 dll 注入进程即可；**游戏目录不落任何文件**。
pub fn install(app: &AppHandle, game_root: &Path) -> Result<Vec<String>, String> {
    let mut log: Vec<String> = Vec::new();

    if !is_valid_root(game_root) {
        return Err(format!(
            "未在指定目录找到 {}: {}",
            GAME_EXE,
            game_root.display()
        ));
    }
    if is_game_running() {
        return Err("游戏正在运行，请先退出游戏再准备".to_string());
    }

    log.push(format!(
        "加载器版本: 3DMigoto {}",
        crate::loader::installed_version(app)
    ));

    // 1) 准备 NSMMI 侧工作目录（d3d11.dll / d3dx.ini / d3dcompiler）
    for line in paths::ensure_loader_files(app)? {
        log.push(line);
    }

    let d3m = paths::d3m_dir();
    let resources = paths::resources_dir(app);

    // 2) 工作目录骨架（3DMigoto 从 d3dx.ini 同级目录找 Mod / ShaderFixes）
    for sub in ["Mod", "ShaderFixes"] {
        fs::create_dir_all(d3m.join(sub)).map_err(|e| format!("创建 {} 失败: {}", sub, e))?;
    }
    let readme = resources.join("Mod").join("README.txt");
    let readme_dst = d3m.join("Mod").join("README.txt");
    if readme.is_file() && !readme_dst.is_file() {
        let _ = fs::copy(&readme, &readme_dst);
    }

    // 3) 迁移游戏目录里已有的 Mod / ShaderFixes（复制，不删原文件）
    for sub in ["Mod", "ShaderFixes"] {
        let src = game_root.join(sub);
        if !src.is_dir() {
            continue;
        }
        match copy_dir_missing(&src, &d3m.join(sub)) {
            Ok(0) => {}
            Ok(count) => log.push(format!(
                "已从游戏目录迁移 {} 个文件到 NSMMI\\Loader\\{}",
                count, sub
            )),
            Err(e) => log.push(format!("迁移 {} 时出错: {}", sub, e)),
        }
    }

    // 4) 清理游戏目录里旧版常驻部署的加载器文件
    for file in ["d3d11.dll", "d3dcompiler_46.dll", "d3dcompiler_47.dll", "d3dx.ini"] {
        let stale = game_root.join(file);
        if stale.is_file() {
            fs::remove_file(&stale).map_err(|e| format!("移除 {} 失败: {}", file, e))?;
            log.push(format!("已从游戏目录撤出 {}", file));
        }
    }
    let old_backup = game_root.join(NSMMI_DIR).join("backup");
    if old_backup.is_dir() {
        let _ = fs::remove_dir_all(&old_backup);
        log.push("已清理旧版原版备份（注入式加载不再需要）".to_string());
    }

    // 5) 写清单（记录准备时间，用于状态展示）
    let manifest = Manifest {
        nsmmi_version: env!("CARGO_PKG_VERSION").to_string(),
        installed_at: config::now_secs(),
        game_root: game_root.to_string_lossy().to_string(),
        files: Vec::new(),
    };
    let raw = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("生成清单失败: {}", e))?;
    fs::write(manifest_path(app), raw).map_err(|e| format!("写入准备记录失败: {}", e))?;

    config::save_game_path(app, &game_root.to_string_lossy())?;
    log.push(format!(
        "准备完成：游戏目录零文件，3Dm 工作目录 {}（Mod / ShaderFixes 都在这里）",
        d3m.display()
    ));
    Ok(log)
}

/// 递归复制缺失的文件（已存在的跳过，绝不覆盖用户文件）
fn copy_dir_missing(src: &Path, dst: &Path) -> Result<usize, String> {
    fs::create_dir_all(dst).map_err(|e| format!("创建目录失败: {}", e))?;
    let mut count = 0usize;
    for entry in fs::read_dir(src)
        .map_err(|e| format!("读取 {} 失败: {}", src.display(), e))?
        .flatten()
    {
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            count += copy_dir_missing(&path, &target)?;
        } else if !target.exists() {
            fs::copy(&path, &target).map_err(|e| format!("复制 {} 失败: {}", path.display(), e))?;
            count += 1;
        }
    }
    Ok(count)
}

/// 卸载：清掉游戏目录里 NSMMI 曾经放过的文件（注入式下应已为零文件）
///
/// 不再动 `Mod\` / `ShaderFixes\`，也保留 NSMMI 侧工作目录里的用户 mod。
pub fn uninstall(app: &AppHandle, game_root: &Path) -> Result<Vec<String>, String> {
    let mut log: Vec<String> = Vec::new();

    if !is_installed(app, game_root) {
        return Err(format!(
            "未在 {} 找到 NSMMI 准备记录",
            game_root.display()
        ));
    }
    if is_game_running() {
        return Err("游戏正在运行，请先退出游戏再卸载".to_string());
    }

    for file in ["d3d11.dll", "d3dcompiler_46.dll", "d3dcompiler_47.dll", "d3dx.ini"] {
        let dst = game_root.join(file);
        if dst.is_file() {
            fs::remove_file(&dst).map_err(|e| format!("删除 {} 失败: {}", file, e))?;
            log.push(format!("已删除游戏目录中的 {}", file));
        }
    }

    let nsmmi_dir = game_root.join(NSMMI_DIR);
    if nsmmi_dir.is_dir() {
        fs::remove_dir_all(&nsmmi_dir).map_err(|e| format!("删除 _NSMMI 失败: {}", e))?;
        log.push("已删除 _NSMMI\\".to_string());
    }

    if fs::remove_file(manifest_path(app)).is_ok() {
        log.push("已移除准备记录".to_string());
    }

    log.push("卸载完成：游戏目录保持原版；工作目录里的 Mod / ShaderFixes 保留".to_string());
    Ok(log)
}

/// 启动游戏的结果
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchOutcome {
    /// 过程日志
    pub lines: Vec<String>,
    /// 需要用户手动操作时的提示（例如在官方启动器里点「开始游戏」）
    pub hint: Option<String>,
}

/// 启动方式（借鉴 XXMI 的 Native / Shell / Manual）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LaunchMode {
    /// 直接启动：带 `-ngp` 拉起 `nshm.exe`，跳过启动器本身
    Direct,
    /// 经官方启动器自动拉起（可自动点「开始游戏」）
    Launcher,
    /// 通过系统 shell 拉起启动器（原生方式异常时的备选）
    Shell,
    /// 手动：只注入加载器，用户自己启动游戏
    Manual,
}

impl LaunchMode {
    pub fn parse(raw: &str) -> Self {
        match raw {
            "launcher" => Self::Launcher,
            "shell" => Self::Shell,
            "manual" => Self::Manual,
            _ => Self::Direct,
        }
    }
}

/// 等待游戏进程出现（秒）
fn wait_for_game(seconds: u64) -> bool {
    let rounds = seconds.saturating_mul(2).max(2);
    for _ in 0..rounds {
        if is_game_running() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    is_game_running()
}

/// 直接启动游戏（跳过官方启动器）
///
/// 客户端只认命令行里的 `-ngp` 标记：NGP 启动器拉起游戏时会把该参数追加到命令行
/// （`app.asar` 中 `runApplication()` 里的 `r.push("-ngp")`），`nshm.exe` 见到它才放行。
/// 不带参数启动（双击 / 直接 CreateProcess）会弹
/// 「请使用[逆水寒手游桌面版启动器]启动本游戏」。
///
/// 所以直接启动 = 带 `-ngp` 拉起 `nshm.exe`，既不需要启动器进程，
/// 也不需要伪装父进程。
///
/// 返回 `Ok(false)` 表示「没起来」，调用方应回退到官方启动器。
fn try_direct_launch(
    game_root: &Path,
    game_exe: &Path,
    loader_dir: &Path,
    inject_mode: InjectMode,
    timeout: u64,
    log: &mut Vec<String>,
) -> Result<bool, String> {
    // 1) Hook 模式必须**先**装钩子：进程一创建窗口就会被回调
    let hook = if inject_mode == InjectMode::Hook {
        match inject::hook_start(loader_dir, GAME_EXE) {
            Ok(hook) => Some(hook),
            Err(e) => {
                log.push(format!("安装注入钩子失败: {}", e));
                None
            }
        }
    } else {
        None
    };

    // 2) 挂起创建游戏进程（带上客户端的启动器标记参数）
    let game: spawn::Child = spawn::spawn_suspended(game_exe, Some(game_root), &[NGP_ARG])?;
    let pid = game.pid;

    if inject_mode == InjectMode::Direct {
        // 趁游戏主线程还挂着先注入：3DMigoto 必须在游戏创建 D3D11 设备之前挂上钩子
        match inject::inject_into(loader_dir, pid) {
            Ok(line) => log.push(line),
            Err(e) => log.push(format!("启动前注入未成功，游戏起来后再试: {}", e)),
        }
    }
    game.resume()?;
    log.push(format!(
        "已直接启动游戏（pid={}，参数 {}），跳过官方启动器",
        pid, NGP_ARG
    ));

    // 3) Hook 模式：放行后等钩子在游戏进程里把 dll 送进去
    if let Some(hook) = hook {
        match inject::hook_wait(hook, 30) {
            Ok(line) => log.push(line),
            Err(e) => log.push(format!("Hook 注入未成功: {}", e)),
        }
    }

    // 4) 等游戏进程出现
    if !wait_for_game(timeout) {
        log.push(format!("已等待 {} 秒，游戏进程未出现", timeout));
        return Ok(false);
    }

    // 5) 稳定性检查：被客户端启动校验拦下时进程会马上退出
    std::thread::sleep(std::time::Duration::from_secs(3));
    if !is_game_running() {
        log.push("游戏进程启动后立即退出（可能被客户端启动校验拦截）".to_string());
        return Ok(false);
    }
    Ok(true)
}

/// 收尾：等游戏起来，确认注入结果（注入器在游戏进程出现后完成）
fn finish_launch(
    loader_dir: &Path,
    inject_mode: InjectMode,
    mut log: Vec<String>,
    timeout: u64,
    hint: String,
) -> Result<LaunchOutcome, String> {
    if wait_for_game(timeout) {
        log.push("游戏已启动".to_string());
        log.extend(inject::confirm(loader_dir, inject_mode, 20));
        log.push("提醒: 请自行评估反作弊风险，仅用于合规场景。".to_string());
        return Ok(LaunchOutcome {
            lines: log,
            hint: None,
        });
    }
    log.push(format!("已等待 {} 秒，仍未检测到游戏进程", timeout));
    // 启动器模式下游戏要等用户在启动器里点「开始游戏」才出现，可能晚得多：
    // 交给后台看护继续等，进程一出现就注入（界面靠状态轮询刷新）
    inject::watch_and_inject(loader_dir.to_path_buf(), inject_mode);
    log.push("已转入后台等待：在启动器里点「开始游戏」后会自动注入，无需再点启动".to_string());
    Ok(LaunchOutcome {
        lines: log,
        hint: Some(hint),
    })
}

/// 启动游戏（需已安装）
///
/// 加载器**不常驻**游戏目录：由 H3DLoader 把工作目录里的 `d3d11.dll`
/// 注入 `nshm.exe` 进程，游戏退出即随之卸载。
///
/// 游戏客户端（nshm.exe）会校验启动来源：不带 `-ngp` 直接拉起会弹
/// 「请使用[逆水寒手游桌面版启动器]启动本游戏」。默认的「直接启动」就是补上
/// 启动器会追加的 `-ngp` 参数直接拉起游戏，失败时自动回退到官方启动器。
///
/// `inject_mode` 决定 3DMigoto 怎么进游戏：Direct（远程线程）/ Hook（全局窗口钩子）。
pub fn launch_game(
    game_root: &Path,
    loader_dir: &Path,
    mode: LaunchMode,
    inject_mode: InjectMode,
    timeout_secs: u64,
) -> Result<LaunchOutcome, String> {
    if !is_valid_root(game_root) {
        return Err(format!(
            "未在指定目录找到 {}: {}",
            GAME_EXE,
            game_root.display()
        ));
    }
    if is_game_running() {
        return Ok(LaunchOutcome {
            lines: vec!["游戏已在运行中".to_string()],
            hint: None,
        });
    }
    let mut log: Vec<String> = Vec::new();
    let game_exe = game_root.join(GAME_EXE);
    let timeout = timeout_secs.clamp(10, 300);

    // 启动前就绪检查（加载器不进游戏目录，注入在游戏进程出现后进行）
    for line in inject::prepare(loader_dir, inject_mode)? {
        log.push(line);
    }

    let timeout_hint = format!(
        "{} 秒内未检测到游戏启动。若已在启动器里点过「开始游戏」，请稍候或在「日志」中查看",
        timeout
    );

    // 直接启动（默认）：带 `-ngp` 拉起游戏，跳过官方启动器；没起来就回退到启动器
    if mode == LaunchMode::Direct {
        match try_direct_launch(
            game_root,
            &game_exe,
            loader_dir,
            inject_mode,
            timeout,
            &mut log,
        ) {
            Ok(true) => return finish_launch(loader_dir, inject_mode, log, timeout, String::new()),
            Ok(false) => log.push("直接启动未成功，自动改用官方启动器".to_string()),
            Err(e) => log.push(format!("直接启动失败: {}，自动改用官方启动器", e)),
        }
    }

    // 手动模式：不动启动器，等用户自己启动
    if mode == LaunchMode::Manual {
        log.push(format!(
            "手动模式：请自行启动游戏（官方启动器 / 桌面快捷方式），最多等待 {} 秒",
            timeout
        ));
        return finish_launch(loader_dir, inject_mode, log, timeout, timeout_hint);
    }

    // Shell 模式：经系统 shell 拉起官方启动器（不做界面自动点击）
    if mode == LaunchMode::Shell {
        let Some(launcher) = find_official_launcher(game_root) else {
            return Err("未找到官方启动器，请改用「手动」启动方式".to_string());
        };
        let cmdline = format!(
            "\"{}\" --game_path=\"{}\"",
            launcher.display(),
            game_exe.display()
        );
        match std::process::Command::new("cmd")
            .args(["/C", "start", "", &cmdline])
            .current_dir(launcher.parent().unwrap_or(game_root))
            .spawn()
        {
            Ok(_) => log.push(format!(
                "已通过 Shell 启动官方启动器: {}",
                launcher.display()
            )),
            Err(e) => return Err(format!("Shell 启动官方启动器失败: {}", e)),
        }
        let _ = focus_by_title_keyword(LAUNCHER_WINDOW_KEYWORD);
        return finish_launch(
            loader_dir,
            inject_mode,
            log,
            timeout,
            format!(
                "请在官方启动器窗口点击「开始游戏」（客户端仅接受由启动器拉起）：{}",
                launcher.display()
            ),
        );
    }

    let Some(launcher) = find_official_launcher(game_root) else {
        // 找不到官方启动器时才退回直接启动（带 `-ngp` + 注入）
        log.push("未找到官方启动器，改用直接启动".to_string());
        return match try_direct_launch(
            game_root,
            &game_exe,
            loader_dir,
            inject_mode,
            timeout,
            &mut log,
        ) {
            Ok(true) => finish_launch(loader_dir, inject_mode, log, timeout, String::new()),
            Ok(false) => Ok(LaunchOutcome {
                lines: log,
                hint: Some(timeout_hint),
            }),
            Err(e) => Err(format!("启动游戏失败: {}", e)),
        };
    };

    if is_launcher_running() {
        log.push("官方启动器已在运行，已将其窗口唤到前台".to_string());
        // 已运行的启动器没有开调试端口，无法自动点击，只能请用户手动点
        for _ in 0..20 {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if focus_by_title_keyword(LAUNCHER_WINDOW_KEYWORD) {
                break;
            }
        }
        return finish_launch(
            loader_dir,
            inject_mode,
            log,
            timeout,
            format!(
                "请在官方启动器窗口点击「开始游戏」（客户端仅接受由启动器拉起）：{}",
                launcher.display()
            ),
        );
    }

    // 启动器没在运行：优先用 NGP（Electron）直启，这样能带上调试端口，
    // 由 NSMMI 自动点击启动器里的「开始游戏」
    let mut auto_clicked = false;
    match find_ngp_launcher(game_root) {
        None => log.push(
            "未找到 NGP 启动器（NGP\\LootHoarder.exe），无法自动点「开始游戏」".to_string(),
        ),
        Some(ngp) => match launcher_ui::pick_debug_port() {
            None => log.push("没有可用的本地调试端口，无法自动点「开始游戏」".to_string()),
            Some(port) => {
                let ngp_dir = ngp.parent().unwrap_or(game_root).to_path_buf();
                let args = [
                    "--url=http://loot-hoarder/ui/zrhtml/main.html".to_string(),
                    "--zr-home-dir=../..".to_string(),
                    format!("--game_path=\"{}\"", game_exe.display()),
                    format!("--remote-debugging-port={}", port),
                ];
                match std::process::Command::new(&ngp)
                    .args(&args)
                    .current_dir(&ngp_dir)
                    .spawn()
                {
                    // 740 = ERROR_ELEVATION_REQUIRED：NGP 的清单要求管理员权限
                    Err(e) if e.raw_os_error() == Some(740) => log.push(
                        "NGP 启动器需要管理员权限（NSMMI 未提权），改用 Launcher.exe 启动"
                            .to_string(),
                    ),
                    Err(e) => log.push(format!("启动 NGP 启动器失败: {}", e)),
                    Ok(_) => {
                        log.push(format!("已启动官方启动器: {}", ngp.display()));
                        // 等 CDP 端点就绪
                        let mut ready = false;
                        for _ in 0..40 {
                            std::thread::sleep(std::time::Duration::from_millis(500));
                            if launcher_ui::is_cdp_ready(port) {
                                ready = true;
                                break;
                            }
                        }
                        if ready {
                            log.push("已接入启动器界面，准备自动点击「开始游戏」".to_string());
                            for _ in 0..10 {
                                if is_game_running() {
                                    break;
                                }
                                if launcher_ui::try_click_start_button(port) {
                                    auto_clicked = true;
                                    log.push("已在官方启动器中自动点击「开始游戏」".to_string());
                                    break;
                                }
                                std::thread::sleep(std::time::Duration::from_millis(1500));
                            }
                            if !auto_clicked && !is_game_running() {
                                log.push(
                                    "没能在启动器界面找到「开始游戏」按钮，请手动点一下"
                                        .to_string(),
                                );
                            }
                        } else {
                            log.push(format!(
                                "启动器调试端口 {} 未就绪（可能被启动器忽略），请手动点「开始游戏」",
                                port
                            ));
                        }
                    }
                }
            }
        },
    }

    if !auto_clicked && !is_game_running() && !is_launcher_running() {
        // NGP 没能拉起（或没有 NGP）：退回官方桌面版启动器
        let args = format!("--game_path=\"{}\"", game_exe.display());
        if std::process::Command::new(&launcher)
            .arg(&args)
            .current_dir(launcher.parent().unwrap_or(game_root))
            .spawn()
            .is_ok()
        {
            log.push(format!("已启动官方启动器: {}", launcher.display()));
        }
        for _ in 0..20 {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if focus_by_title_keyword(LAUNCHER_WINDOW_KEYWORD) {
                break;
            }
        }
    }

    finish_launch(
        loader_dir,
        inject_mode,
        log,
        timeout,
        format!(
            "请在官方启动器窗口点击「开始游戏」（客户端仅接受由启动器拉起）：{}",
            launcher.display()
        ),
    )
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    /// 端到端探针：真的按「直接启动」把游戏拉起来（会启动 nshm.exe，默认跳过）
    ///
    /// ```text
    /// set NSMMI_PROBE_DIRECT=1
    /// set NSMMI_PROBE_ROOT=E:\Netease\逆水寒手游\game
    /// set NSMMI_PROBE_LOADER=%APPDATA%\NSMMI\Loader
    /// cargo test --lib direct_launch_probe -- --nocapture
    /// ```
    #[test]
    fn direct_launch_probe() {
        if std::env::var("NSMMI_PROBE_DIRECT").is_err() {
            return;
        }
        let root = std::env::var("NSMMI_PROBE_ROOT").unwrap_or_default();
        let loader = std::env::var("NSMMI_PROBE_LOADER").unwrap_or_default();
        if root.is_empty() || loader.is_empty() {
            return;
        }
        let outcome = launch_game(Path::new(&root), Path::new(&loader), LaunchMode::Direct, 30)
            .expect("启动失败");
        for line in &outcome.lines {
            println!("{}", line);
        }
        println!("hint: {:?}", outcome.hint);
    }
}
