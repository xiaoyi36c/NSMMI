use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use sysinfo::{ProcessesToUpdate, System};

pub const GAME_EXE: &str = "nshm.exe";
const PROCESS_NAME: &str = "nshm";
const DIR_PATTERNS: [&str; 3] = [
    "Netease\\逆水寒手游\\game",
    "逆水寒手游\\game",
    "Netease\\NSH Mobile\\game",
];

/// 判断目录是否为合法游戏根目录（含 nshm.exe）
pub fn is_valid_root(root: &Path) -> bool {
    !root.as_os_str().is_empty() && root.join(GAME_EXE).is_file()
}

/// 游戏进程是否正在运行
pub fn is_game_running() -> bool {
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    // 先求值再返回，避免迭代器临时值的借用越过 sys 的作用域
    let running = sys
        .processes_by_name(OsStr::new(PROCESS_NAME))
        .next()
        .is_some();
    running
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
