//! Windows 窗口工具：按标题关键字找到窗口并恢复到前台
//!
//! 用于把网易启动器（逆水寒手游桌面版启动器 / NGP）窗口唤到前台，
//! 让用户可以直接点「开始游戏」。

/// 按标题关键字查找窗口并置前（找到返回 true）
#[cfg(windows)]
pub fn focus_by_title_keyword(keyword: &str) -> bool {
    use std::cell::RefCell;

    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW, IsWindowVisible, SetForegroundWindow,
        ShowWindow, SW_RESTORE,
    };

    thread_local! {
        static KEYWORD: RefCell<String> = const { RefCell::new(String::new()) };
        static FOUND: RefCell<Option<isize>> = const { RefCell::new(None) };
    }

    KEYWORD.with(|k| *k.borrow_mut() = keyword.to_string());
    FOUND.with(|f| *f.borrow_mut() = None);

    unsafe extern "system" fn callback(hwnd: HWND, _lparam: LPARAM) -> BOOL {
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let len = GetWindowTextLengthW(hwnd);
        if len <= 0 {
            return 1;
        }
        let mut buf = vec![0u16; len as usize + 1];
        let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if n <= 0 {
            return 1;
        }
        let title = String::from_utf16_lossy(&buf[..n as usize]);
        let hit = KEYWORD.with(|k| title.contains(&k.borrow().clone()));
        if hit {
            FOUND.with(|f| *f.borrow_mut() = Some(hwnd as isize));
            return 0; // 停止枚举
        }
        1
    }

    unsafe {
        EnumWindows(Some(callback), 0);
    }

    let handle = FOUND.with(|f| *f.borrow());
    match handle {
        Some(hwnd) => unsafe {
            ShowWindow(hwnd as HWND, SW_RESTORE);
            SetForegroundWindow(hwnd as HWND);
            true
        },
        None => false,
    }
}

/// 非 Windows 平台无窗口操作
#[cfg(not(windows))]
pub fn focus_by_title_keyword(_keyword: &str) -> bool {
    false
}
