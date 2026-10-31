//! 3DMigoto 注入（进程注入，**不改动游戏目录**）
//!
//! 加载器全部留在 NSMMI 侧的工作目录（`.../NSMMI/Loader`），由注入器
//! （[`crate::injector::INJECTOR_DLL`]，即 H3DLoader）把 `d3d11.dll` 送进游戏进程：
//!
//! | 方式 | 时机 | 说明 |
//! | --- | --- | --- |
//! | Direct | 游戏进程挂起时 / 进程出现后 | 远程线程 `LoadLibraryW`，能抢在 D3D11 设备创建前 |
//! | Hook | 游戏窗口创建时 | 全局窗口钩子把 dll 送进目标进程，不碰进程句柄 |
//!
//! - 启动前 [`prepare`]：就绪检查
//! - 游戏进程出现后 [`confirm`]：按当前方式注入
//! - 直接启动时 [`inject_into`]（Direct）/ [`hook_start`] + [`hook_wait`]（Hook）
//! - 取消 [`stop`]：只清注入状态（dll 随游戏进程退出卸载）
//! - 旧版本（拷贝代理 dll）留下的残留由 [`cleanup_legacy`] 清掉
//!
//! **为什么不用全局钩子把 dll 载进本进程**：3DMigoto 1.4.9 的 `d3d11.dll` 在
//! `DllMain` 里校验宿主可执行文件名，只有宿主是 `nshm.exe` 时才初始化成功。
//! H3DLoader 的 Hook 模式只在**目标进程**里加载载荷，所以能过校验。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use crate::game;
use crate::injector::{self, InjectMode};

/// 待注入的加载器 dll
pub const LOADER_DLL: &str = "d3d11.dll";

/// 单次远程注入的超时（秒）
const INJECT_TIMEOUT_SECS: u32 = 10;

/// 旧版方案会放进游戏目录的加载器文件
const LEGACY_FILES: [&str; 4] = [
    "d3d11.dll",
    "d3dcompiler_46.dll",
    "d3dcompiler_47.dll",
    "d3dx.ini",
];

/// 旧版的注入记录 / 备份目录
const NSMMI_DIR: &str = "_NSMMI";

/// 已注入成功的游戏进程 pid（0 = 未注入）
///
/// 记 pid 而不是布尔值：直接启动失败换成启动器拉起时，旧进程的注入状态
/// 不能算到新进程头上。
static INJECTED_PID: AtomicU32 = AtomicU32::new(0);

/// 后台看护的代次：每次 prepare / stop 自增，旧看护线程据此自行退出
static WATCH_GEN: AtomicU64 = AtomicU64::new(0);

/// 后台看护最长等多久（启动器模式下用户可能很久才点「开始游戏」）
const WATCH_MAX_SECS: u64 = 600;

/// 当前是否已注入成功（且注入的正是现在跑着的这个游戏进程）
pub fn is_active() -> bool {
    let pid = INJECTED_PID.load(Ordering::Relaxed);
    pid != 0 && game::find_game_pid() == Some(pid)
}

/// 启动前：就绪检查
pub fn prepare(loader_dir: &Path, mode: InjectMode) -> Result<Vec<String>, String> {
    if game::is_game_running() {
        return Err("游戏正在运行，无法注入加载器，请先退出游戏".to_string());
    }
    let dll_path = loader_dir.join(LOADER_DLL);
    if !dll_path.is_file() {
        return Err(format!("缺少待注入的加载器: {}", dll_path.display()));
    }

    let injector_path = match injector::resolve(loader_dir) {
        Some((path, ours)) => {
            if mode == InjectMode::Hook && !ours {
                return Err(format!(
                    "Hook 注入需要 {}（{} 只支持 Direct）",
                    injector::INJECTOR_DLL,
                    injector::LEGACY_INJECTOR_DLL
                ));
            }
            path
        }
        None => {
            return Err(format!(
                "缺少注入器 {}/{}",
                injector::INJECTOR_DLL,
                injector::LEGACY_INJECTOR_DLL
            ))
        }
    };

    INJECTED_PID.store(0, Ordering::Relaxed);
    WATCH_GEN.fetch_add(1, Ordering::Relaxed);

    let mode_text = match mode {
        InjectMode::Direct => "Direct（远程线程）",
        InjectMode::Hook => "Hook（全局窗口钩子）",
    };
    Ok(vec![
        format!(
            "注入器已就绪（{}，{}）",
            mode_text,
            injector_path.display()
        ),
        "游戏目录不落任何文件，加载器在游戏进程出现后注入".to_string(),
    ])
}

/// Direct：立即注入到指定进程
///
/// 直接启动时可以做到「挂起创建 → 注入 → 恢复运行」，让 3DMigoto 在游戏创建
/// D3D11 设备之前就挂好钩子，这是最稳的时机。
pub fn inject_into(loader_dir: &Path, pid: u32) -> Result<String, String> {
    let line = injector::inject(loader_dir, pid, LOADER_DLL, INJECT_TIMEOUT_SECS)?;
    INJECTED_PID.store(pid, Ordering::Relaxed);
    Ok(line)
}

/// Hook：安装钩子（要在目标进程创建**之前**装好）
pub fn hook_start(loader_dir: &Path, target_exe: &str) -> Result<injector::Hook, String> {
    injector::Hook::install(loader_dir, LOADER_DLL, target_exe)
}

/// Hook：等钩子把 dll 送进目标进程（成功后记录 pid）
pub fn hook_wait(hook: injector::Hook, timeout_secs: u64) -> Result<String, String> {
    let line = hook.wait(timeout_secs.min(u32::MAX as u64) as u32)?;
    if let Some(pid) = game::find_game_pid() {
        INJECTED_PID.store(pid, Ordering::Relaxed);
    }
    Ok(line)
}

/// 按注入方式等游戏进程出现并注入
///
/// Direct 会在超时前反复尝试：游戏刚起来时远程线程可能被短暂拦截。
pub fn confirm(loader_dir: &Path, mode: InjectMode, timeout_secs: u64) -> Vec<String> {
    let mut log: Vec<String> = Vec::new();
    if is_active() {
        log.push("3DMigoto 已注入，Mod 已生效".to_string());
        return log;
    }

    match mode {
        InjectMode::Hook => {
            let hook = match hook_start(loader_dir, game::GAME_EXE) {
                Ok(hook) => hook,
                Err(e) => {
                    log.push(format!("安装注入钩子失败: {}", e));
                    return log;
                }
            };
            match hook.wait(timeout_secs.min(u32::MAX as u64) as u32) {
                Ok(line) => {
                    log.push(line);
                    log.push("3DMigoto 注入成功，Mod 已生效".to_string());
                }
                Err(e) => log.push(format!("注入失败: {}", e)),
            }
            log
        }
        InjectMode::Direct => {
            let deadline = Instant::now() + Duration::from_secs(timeout_secs.max(1));
            let mut seen = false;
            let mut attempts = 0u32;
            let mut last_error: Option<(u32, String)> = None;

            loop {
                if let Some(pid) = game::find_game_pid() {
                    if !seen {
                        log.push(format!("检测到游戏进程（pid={}），开始注入 3DMigoto", pid));
                        seen = true;
                    }
                    match inject_into(loader_dir, pid) {
                        Ok(line) => {
                            log.push(line);
                            log.push("3DMigoto 注入成功，Mod 已生效".to_string());
                            return log;
                        }
                        Err(e) => {
                            attempts += 1;
                            last_error = Some((pid, e));
                        }
                    }
                }
                if Instant::now() >= deadline {
                    break;
                }
                std::thread::sleep(Duration::from_millis(500));
            }

            match last_error {
                Some((pid, err)) => {
                    log.push(format!(
                        "注入失败: {}（目标 pid={}，共尝试 {} 次）",
                        err, pid, attempts
                    ));
                    if game::find_game_pid() == Some(pid) {
                        log.push(
                            "游戏仍在运行但注入未成功：可能被反作弊拦截，或注入时机太晚"
                                .to_string(),
                        );
                    } else {
                        log.push("游戏进程已退出，注入未完成".to_string());
                    }
                }
                None => log.push(format!(
                    "{} 秒内未检测到游戏进程（{}），未注入 3DMigoto",
                    timeout_secs,
                    game::GAME_EXE
                )),
            }
            log
        }
    }
}

/// 后台看护：等 `nshm.exe` 出现就注入
///
/// 启动器模式下 NSMMI 只能把启动器拉起来，游戏要等用户点「开始游戏」才出现，
/// 可能超出 `wait_for_game` 的等待窗口；这里继续盯最多 [`WATCH_MAX_SECS`] 秒。
pub fn watch_and_inject(loader_dir: PathBuf, mode: InjectMode) {
    let gen = WATCH_GEN.fetch_add(1, Ordering::Relaxed) + 1;
    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(WATCH_MAX_SECS);
        let mut hook: Option<injector::Hook> = None;

        while Instant::now() < deadline {
            if WATCH_GEN.load(Ordering::Relaxed) != gen || is_active() {
                return;
            }
            match mode {
                InjectMode::Direct => {
                    if let Some(pid) = game::find_game_pid() {
                        match inject_into(&loader_dir, pid) {
                            Ok(line) => {
                                eprintln!("[nsmmi] {}", line);
                                return;
                            }
                            Err(e) => eprintln!("[nsmmi] {}", e),
                        }
                    }
                }
                InjectMode::Hook => {
                    if hook.is_none() {
                        match hook_start(&loader_dir, game::GAME_EXE) {
                            Ok(h) => hook = Some(h),
                            Err(e) => eprintln!("[nsmmi] 安装注入钩子失败: {}", e),
                        }
                    } else if let Some(pid) = game::find_game_pid() {
                        // 钩子已经装好，等目标进程处理窗口消息即可
                        if let Some(h) = hook.take() {
                            match h.wait(30) {
                                Ok(line) => {
                                    eprintln!("[nsmmi] {}", line);
                                    INJECTED_PID.store(pid, Ordering::Relaxed);
                                    return;
                                }
                                Err(e) => {
                                    eprintln!("[nsmmi] {}", e);
                                    // 目标还没真正起来：重新装钩子继续等
                                    hook = hook_start(&loader_dir, game::GAME_EXE).ok();
                                }
                            }
                        }
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(1000));
        }
    });
}

/// 取消注入
///
/// 已注入的 `d3d11.dll` 无法从游戏进程里撤出，只能随游戏退出一起卸载，
/// 这里只清注入状态，并让后台看护线程退出。
pub fn stop() -> Vec<String> {
    INJECTED_PID.store(0, Ordering::Relaxed);
    WATCH_GEN.fetch_add(1, Ordering::Relaxed);
    vec!["已停止注入状态（加载器随游戏退出自动卸载）".to_string()]
}

/// 游戏目录里是否残留旧版加载器（`d3dx.ini` 是 3DMigoto 独有文件）
pub fn has_resident_files(game_root: &Path) -> bool {
    game_root.join("d3dx.ini").is_file()
}

/// 清理旧版本拷进游戏目录的加载器与注入记录
pub fn cleanup_legacy(game_root: &Path) -> Vec<String> {
    let mut log: Vec<String> = Vec::new();
    for file in LEGACY_FILES {
        let path = game_root.join(file);
        if path.is_file() && fs::remove_file(&path).is_ok() {
            log.push(format!("已从游戏目录撤出 {}", file));
        }
    }
    let old = game_root.join(NSMMI_DIR);
    if old.is_dir() && fs::remove_dir_all(&old).is_ok() {
        log.push("已清理旧版注入记录 _NSMMI\\".to_string());
    }
    log
}
