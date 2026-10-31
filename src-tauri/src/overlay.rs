//! 调试悬浮窗：置顶、半透明、可拖动的独立小窗（不注入游戏进程）
//!
//! 通过全局快捷键 Ctrl+Shift+H 或设置页开关显隐；内容与主窗口共用
//! 前端（以窗口 label == "overlay" 区分）。

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// 悬浮窗显隐广播事件：主窗口据此同步「调试悬浮窗」开关状态
pub const VISIBILITY_EVENT: &str = "nsmmi://overlay-visibility";

/// 悬浮窗默认尺寸 / 最小尺寸（逻辑像素）
const DEFAULT_SIZE: (f64, f64) = (460.0, 560.0);
const MIN_SIZE: (f64, f64) = (380.0, 420.0);
/// 距屏幕边缘的留白（逻辑像素）
const SCREEN_MARGIN: f64 = 16.0;

/// 显隐悬浮窗（不存在则创建并显示）
pub fn toggle(app: &AppHandle) -> Result<bool, String> {
    let visible = match app.get_webview_window("overlay") {
        Some(win) => {
            let visible = win.is_visible().map_err(|e| e.to_string())?;
            if visible {
                win.hide().map_err(|e| format!("隐藏悬浮窗失败: {}", e))?;
                false
            } else {
                win.show().map_err(|e| format!("显示悬浮窗失败: {}", e))?;
                let _ = win.set_focus();
                true
            }
        }
        None => {
            let (x, y) = top_right_position(app);
            let win = WebviewWindowBuilder::new(
                app,
                "overlay",
                WebviewUrl::App("index.html".into()),
            )
            .title("NSMMI 调试悬浮窗")
            .inner_size(DEFAULT_SIZE.0, DEFAULT_SIZE.1)
            .min_inner_size(MIN_SIZE.0, MIN_SIZE.1)
            .position(x, y)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .resizable(true)
            .skip_taskbar(true)
            .visible(true)
            .build()
            .map_err(|e| format!("创建悬浮窗失败: {}", e))?;
            let _ = win.set_focus();
            true
        }
    };

    // 广播显隐状态：主窗口与悬浮窗任意一侧隐藏，另一侧开关同步更新
    let _ = app.emit(VISIBILITY_EVENT, visible);
    Ok(visible)
}

/// 悬浮窗初始位置：主窗口所在显示器的右上角（避免遮挡主窗口内容）
fn top_right_position(app: &AppHandle) -> (f64, f64) {
    let Some(main) = app.get_webview_window("main") else {
        return (SCREEN_MARGIN, SCREEN_MARGIN);
    };
    let Ok(Some(monitor)) = main.current_monitor() else {
        return (SCREEN_MARGIN, SCREEN_MARGIN);
    };

    let scale = monitor.scale_factor().max(0.1);
    let size = monitor.size();
    let origin = monitor.position();
    let right = f64::from(origin.x) / scale + f64::from(size.width) / scale;
    let top = f64::from(origin.y) / scale;

    (
        (right - DEFAULT_SIZE.0 - SCREEN_MARGIN).max(0.0),
        top + SCREEN_MARGIN,
    )
}
