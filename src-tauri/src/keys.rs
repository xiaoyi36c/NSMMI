//! 游戏内热键模拟：把 3DMigoto 的游戏内按键做成可视化键帽
//!
//! 逆水寒的猎取 / 重载热键主要绑定在小键盘与 F 键上，部分笔记本没有小键盘，
//! 这里提供「点击键帽 = 向游戏发送一次按键」的兜底方案。
//!
//! 实现要点：
//! - `keybd_event` 会同步刷新全局异步按键状态，3DMigoto 用 `GetAsyncKeyState`
//!   轮询热键，因此游戏不在前台也能收到；
//! - 发送前先把游戏窗口切到前台，保证使用原始输入（Raw Input）的游戏也能收到。

use crate::game;

/// 按键名 → Windows 虚拟键码（仅白名单内的按键）
pub fn vk_for(key: &str) -> Option<u8> {
    let name = key.trim().to_ascii_uppercase();

    // F1 ~ F12
    if let Some(rest) = name.strip_prefix('F') {
        if let Ok(n) = rest.parse::<u8>() {
            if (1..=12).contains(&n) {
                return Some(0x6F + n);
            }
        }
    }
    // 小键盘 0 ~ 9
    if let Some(rest) = name.strip_prefix("NUMPAD") {
        if let Ok(n) = rest.parse::<u8>() {
            if n <= 9 {
                return Some(0x60 + n);
            }
        }
    }

    match name.as_str() {
        "PRINTSCREEN" => Some(0x2C),
        "PAUSE" => Some(0x13),
        "HOME" => Some(0x24),
        "END" => Some(0x23),
        "INSERT" => Some(0x2D),
        "DELETE" => Some(0x2E),
        "PAGEUP" => Some(0x21),
        "PAGEDOWN" => Some(0x22),
        "SPACE" => Some(0x20),
        "ENTER" => Some(0x0D),
        "TAB" => Some(0x09),
        "BACKSPACE" => Some(0x08),
        "ESCAPE" => Some(0x1B),
        "LEFT" => Some(0x25),
        "UP" => Some(0x26),
        "RIGHT" => Some(0x27),
        "DOWN" => Some(0x28),
        _ => {
            // 数字键与字母键：虚拟键码等于 ASCII 码
            let mut chars = name.chars();
            match (chars.next(), chars.next()) {
                (Some(c), None) if c.is_ascii_digit() || c.is_ascii_uppercase() => Some(c as u8),
                _ => None,
            }
        }
    }
}

/// 向游戏发送一次按键
pub fn send_key(key: &str) -> Result<String, String> {
    let vk = vk_for(key).ok_or_else(|| format!("不支持的按键：{}", key))?;
    if !game::is_game_running() {
        return Err("游戏未运行，无法发送按键".to_string());
    }

    #[cfg(windows)]
    {
        platform::focus_game();
        std::thread::sleep(std::time::Duration::from_millis(80));
        platform::tap(vk);
        Ok(format!("已向游戏发送 {}", key))
    }
    #[cfg(not(windows))]
    {
        let _ = vk;
        Err("当前平台暂不支持模拟按键".to_string())
    }
}

#[cfg(windows)]
mod platform {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYEVENTF_KEYUP};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow, ShowWindow,
        SW_RESTORE,
    };

    /// 模拟一次按键（同时刷新全局异步按键状态）
    pub fn tap(vk: u8) {
        unsafe {
            keybd_event(vk, 0, 0, 0);
            std::thread::sleep(std::time::Duration::from_millis(30));
            keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
        }
    }

    /// 把游戏窗口切到前台，保证按键送达游戏
    pub fn focus_game() -> bool {
        let Some(hwnd) = game_window() else {
            return false;
        };
        unsafe {
            ShowWindow(hwnd, SW_RESTORE);
            SetForegroundWindow(hwnd) != 0
        }
    }

    /// 枚举顶层窗口，找到游戏进程的可见窗口
    fn game_window() -> Option<HWND> {
        let pid = crate::game::find_game_pid()?;

        struct FindCtx {
            pid: u32,
            found: Option<HWND>,
        }

        unsafe extern "system" fn callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let ctx = &mut *(lparam as *mut FindCtx);
            if ctx.found.is_some() {
                return 0; // 已找到，停止枚举
            }
            let mut wpid = 0u32;
            GetWindowThreadProcessId(hwnd, &mut wpid);
            if wpid == ctx.pid && IsWindowVisible(hwnd) != 0 {
                ctx.found = Some(hwnd);
                return 0;
            }
            1
        }

        let mut ctx = FindCtx { pid, found: None };
        unsafe {
            EnumWindows(Some(callback), &mut ctx as *mut FindCtx as LPARAM);
        }
        ctx.found
    }
}
