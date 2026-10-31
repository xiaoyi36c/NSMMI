use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use sysinfo::{ProcessesToUpdate, System};

pub const GAME_EXE: &str = "nshm.exe";
/// 官方桌面版启动器（桌面快捷方式指向它）
pub const LAUNCHER_EXE: &str = "Launcher.exe";
/// NGP 启动器（Electron 版，NGP 目录下）
pub const NGP_LAUNCHER_EXE: &str = "NGP\\LootHoarder.exe";
/// 官方启动器进程名（游戏客户端只接受由它们拉起）
///
/// 注意：必须写全 `xxx.exe`。sysinfo 的 `processes_by_name` 是**子串匹配**，
/// 用 `"nshm"` 会把 `nshm_launcher.exe` 当成游戏，导致"启动器一起来就报
/// 游戏已启动"，并去注入启动器进程。这里统一用 `processes_by_exact_name`。
pub const LAUNCHER_PROCESSES: [&str; 2] = ["LootHoarder.exe", "nshm_launcher.exe"];
const DIR_PATTERNS: [&str; 3] = [
    "Netease\\逆水寒手游\\game",
    "逆水寒手游\\game",
    "Netease\\NSH Mobile\\game",
];

/// 判断目录是否为合法游戏根目录（含 nshm.exe）
pub fn is_valid_root(root: &Path) -> bool {
    !root.as_os_str().is_empty() && root.join(GAME_EXE).is_file()
}

/// 游戏进程是否正在运行（`nshm.exe` 精确匹配，不含 `nshm_launcher.exe`）
pub fn is_game_running() -> bool {
    find_game_pid().is_some()
}

/// 游戏进程 id
pub fn find_game_pid() -> Option<u32> {
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    // 精确匹配：`processes_by_name` 是子串匹配，会把 nshm_launcher.exe 算进来
    let pid = sys
        .processes_by_exact_name(OsStr::new(GAME_EXE))
        .next()
        .map(|p| p.pid().as_u32());
    pid
}

/// 3DMigoto 是否真的加载进了游戏进程
///
/// 注入成功后，游戏进程里会多出一个模块，路径就是工作目录下的
/// `Loader\d3d11.dll`（不是游戏目录里的代理 dll）。
#[cfg(windows)]
pub fn is_loader_loaded(dll_path: &Path) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Module32FirstW, Module32NextW, MODULEENTRY32W, TH32CS_SNAPMODULE,
        TH32CS_SNAPMODULE32,
    };

    let Some(pid) = find_game_pid() else {
        return false;
    };
    let expected = normalize_path(&dll_path.to_string_lossy());

    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid);
        if snapshot.is_null() || snapshot == INVALID_HANDLE_VALUE {
            return false;
        }

        let mut entry: MODULEENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<MODULEENTRY32W>() as u32;
        let mut found = false;
        if Module32FirstW(snapshot, &mut entry) != 0 {
            loop {
                if normalize_path(&wide_to_string(&entry.szExePath)) == expected {
                    found = true;
                    break;
                }
                entry.dwSize = std::mem::size_of::<MODULEENTRY32W>() as u32;
                if Module32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snapshot);
        found
    }
}

#[cfg(not(windows))]
pub fn is_loader_loaded(_dll_path: &Path) -> bool {
    false
}

/// 路径比较用：统一分隔符并忽略大小写
fn normalize_path(path: &str) -> String {
    path.replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

#[cfg(windows)]
fn wide_to_string(buf: &[u16]) -> String {
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len])
}

/// 查找官方启动器（按优先级：上级目录的桌面版启动器 → 游戏目录 → NGP 启动器）
///
/// 只在「启动器 / Shell / 手动」这几种启动方式里用到；「直接启动」不需要它
/// （补上 [`NGP_ARG`] 即可，见 [`crate::install::launch_game`]）。
pub fn find_official_launcher(game_root: &Path) -> Option<PathBuf> {
    let parent = game_root
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| game_root.to_path_buf());
    let candidates = [
        parent.join(LAUNCHER_EXE),
        game_root.join(LAUNCHER_EXE),
        parent.join(NGP_LAUNCHER_EXE),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

/// 查找 NGP 启动器（Electron 版，位于游戏根目录上一级的 NGP 目录）
///
/// NGP 可以接受 `--remote-debugging-port`，NSMMI 用它来自动点击「开始游戏」。
pub fn find_ngp_launcher(game_root: &Path) -> Option<PathBuf> {
    let parent = game_root.parent()?;
    let exe = parent.join(NGP_LAUNCHER_EXE);
    if exe.is_file() {
        Some(exe)
    } else {
        None
    }
}

/// 客户端「由官方启动器拉起」的标记参数
///
/// NGP 启动器的 `runApplication()` 在拉起游戏前会把 `-ngp` 追加到命令行
/// （`app.asar` 里 `r.push("-ngp")`），`nshm.exe` 只认这个参数：
/// 直接双击（无参数）会弹「请使用[逆水寒手游桌面版启动器]启动本游戏」，
/// 带上 `-ngp` 就正常进游戏，**与父进程无关**。
pub const NGP_ARG: &str = "-ngp";

/// 官方启动器是否已在运行
pub fn is_launcher_running() -> bool {
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    LAUNCHER_PROCESSES.iter().any(|name| {
        sys.processes_by_exact_name(OsStr::new(name))
            .next()
            .is_some()
    })
}

/// 自动定位游戏目录：上次记录 → 注册表卸载项 → 各盘符常见路径
pub fn find_game_root(stored: Option<&str>) -> Option<PathBuf> {
    if let Some(path) = stored {
        let path = PathBuf::from(path);
        if is_valid_root(&path) {
            return Some(path);
        }
    }

    for candidate in registry_candidates() {
        if is_valid_root(&candidate) {
            return Some(candidate);
        }
    }

    for candidate in drive_candidates() {
        if is_valid_root(&candidate) {
            return Some(candidate);
        }
    }

    None
}

#[cfg(windows)]
fn registry_candidates() -> Vec<PathBuf> {
    use winreg::enums::{
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY,
    };
    use winreg::{HKEY, RegKey};

    const BASES: [(HKEY, &str); 3] = [
        (
            HKEY_LOCAL_MACHINE,
            "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        ),
        (
            HKEY_LOCAL_MACHINE,
            "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        ),
        (
            HKEY_CURRENT_USER,
            "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        ),
    ];
    const VIEWS: [u32; 2] = [KEY_WOW64_64KEY, KEY_WOW64_32KEY];

    let mut out: Vec<PathBuf> = Vec::new();

    for (hkey, base) in BASES {
        for view in VIEWS {
            let root = RegKey::predef(hkey);
            let Ok(key) = root.open_subkey_with_flags(base, KEY_READ | view) else {
                continue;
            };
            for name in key.enum_keys().flatten() {
                let Ok(entry) = key.open_subkey_with_flags(&name, KEY_READ | view) else {
                    continue;
                };
                let display: Option<String> = entry.get_value("DisplayName").ok();
                if !display.unwrap_or_default().contains("逆水寒") {
                    continue;
                }
                if let Some(location) = entry.get_value::<String, _>("InstallLocation").ok() {
                    let base = PathBuf::from(location);
                    out.push(base.join("game"));
                    out.push(base);
                }
            }
        }
    }

    out
}

#[cfg(not(windows))]
fn registry_candidates() -> Vec<PathBuf> {
    Vec::new()
}

fn drive_candidates() -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    for letter in 'C'..='Z' {
        let drive = format!("{}:\\", letter);
        let root = Path::new(&drive);
        if !root.exists() {
            continue;
        }
        for pattern in DIR_PATTERNS {
            out.push(root.join(pattern));
        }
    }
    out
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};
    use std::time::Duration;

    /// 进程名必须精确匹配：`nshm_launcher.exe` 是启动器，`nshm.exe` 才是游戏
    ///
    /// sysinfo 的 `processes_by_name` 是**子串匹配**，曾经用 `"nshm"` 导致
    /// 「启动器一起来就报游戏已启动」，随后去注入启动器进程（`Inject` 返回 100）。
    #[test]
    fn process_match_is_exact() {
        let ping = Path::new("C:\\Windows\\System32\\ping.exe");
        // 机器上正跑着真游戏时不动它，避免误杀 / 误判
        if !ping.is_file() || is_game_running() {
            return;
        }

        let dir = std::env::temp_dir().join(format!("nsmmi-proc-match-{}", std::process::id()));
        if std::fs::create_dir_all(&dir).is_err() {
            return;
        }
        // 用系统 ping.exe 改名成目标进程名，起一个能活 20 秒的进程
        let spawn_copy = |name: &str| -> Option<std::process::Child> {
            let exe = dir.join(name);
            std::fs::copy(ping, &exe).ok()?;
            Command::new(&exe)
                .args(["-n", "20", "127.0.0.1"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .ok()
        };

        // 1) 启动器进程：不算游戏，但要算启动器
        let Some(mut launcher) = spawn_copy("nshm_launcher.exe") else {
            let _ = std::fs::remove_dir_all(&dir);
            return;
        };
        std::thread::sleep(Duration::from_millis(700));
        let matched_launcher = find_game_pid();
        let launcher_running = is_launcher_running();
        let _ = launcher.kill();
        let _ = launcher.wait();

        // 2) 游戏进程：必须命中，且 pid 对得上
        let Some(mut game) = spawn_copy("nshm.exe") else {
            let _ = std::fs::remove_dir_all(&dir);
            return;
        };
        let game_id = game.id();
        std::thread::sleep(Duration::from_millis(700));
        let matched_game = find_game_pid();
        let game_running = is_game_running();
        let _ = game.kill();
        let _ = game.wait();
        let _ = std::fs::remove_dir_all(&dir);

        assert_eq!(matched_launcher, None, "nshm_launcher.exe 被误判成游戏进程");
        assert!(launcher_running, "nshm_launcher.exe 应被识别为启动器");
        assert_eq!(matched_game, Some(game_id), "nshm.exe 应被识别为游戏进程");
        assert!(game_running);
    }
}
