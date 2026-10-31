use std::fs;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub game_path: Option<String>,
    /// 自定义背景图的本地绝对路径
    pub wallpaper_path: Option<String>,
    /// 界面主题：light | dark | custom（自定义壁纸）
    pub theme: Option<String>,
    /// 界面基准字号（12–18）
    pub font_size: Option<u8>,
    /// 自动更新 3DMigoto 加载器
    pub auto_update: Option<bool>,
    /// 启动方式：direct（跳过官方启动器）| launcher（经官方启动器自动拉起）| shell | manual
    pub launch_mode: Option<String>,
    /// 启动后等待游戏进程出现的超时（秒）
    pub launch_timeout: Option<u64>,
    /// 注入方式：direct（远程线程）| hook（全局窗口钩子）
    pub inject_mode: Option<String>,
    /// 在线更新后的 3DMigoto 版本
    pub loader_version: Option<String>,
    pub version: String,
    pub updated: u64,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            game_path: None,
            wallpaper_path: None,
            theme: None,
            font_size: None,
            auto_update: None,
            launch_mode: None,
            launch_timeout: None,
            inject_mode: None,
            loader_version: None,
            version: env!("CARGO_PKG_VERSION").to_string(),
            updated: 0,
        }
    }
}

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn load(app: &AppHandle) -> AppConfig {
    let file = paths::config_file(app);
    match fs::read_to_string(&file) {
        Ok(raw) => serde_json::from_str::<AppConfig>(&raw).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn store(app: &AppHandle, cfg: &AppConfig) -> Result<(), String> {
    let dir = paths::config_dir(app);
    fs::create_dir_all(&dir).map_err(|e| format!("创建配置目录失败: {}", e))?;

    let raw = serde_json::to_string_pretty(cfg).map_err(|e| format!("序列化配置失败: {}", e))?;
    fs::write(paths::config_file(app), raw).map_err(|e| format!("写入配置失败: {}", e))?;
    Ok(())
}

pub fn save_game_path(app: &AppHandle, game_path: &str) -> Result<(), String> {
    let mut cfg = load(app);
    cfg.game_path = Some(game_path.to_string());
    cfg.version = env!("CARGO_PKG_VERSION").to_string();
    cfg.updated = now_secs();
    store(app, &cfg)
}

pub fn set_wallpaper(app: &AppHandle, wallpaper_path: Option<String>) -> Result<(), String> {
    let mut cfg = load(app);
    cfg.wallpaper_path = wallpaper_path;
    cfg.updated = now_secs();
    store(app, &cfg)
}

/// 保存界面设置（主题 + 字号 + 自动更新），非法主题回退 light
pub fn set_ui_settings(
    app: &AppHandle,
    theme: &str,
    font_size: u8,
    auto_update: bool,
) -> Result<(), String> {
    let theme = match theme {
        "dark" | "custom" => theme,
        _ => "light",
    };
    let font_size = font_size.clamp(12, 18);

    let mut cfg = load(app);
    cfg.theme = Some(theme.to_string());
    cfg.font_size = Some(font_size);
    cfg.auto_update = Some(auto_update);
    cfg.updated = now_secs();
    store(app, &cfg)
}

/// 启动方式与超时（direct | launcher | shell | manual）
pub fn launch_settings(app: &AppHandle) -> (String, u64) {
    let cfg = load(app);
    let mode = match cfg.launch_mode.as_deref() {
        Some("launcher") => "launcher",
        Some("shell") => "shell",
        Some("manual") => "manual",
        _ => "direct",
    };
    (mode.to_string(), cfg.launch_timeout.unwrap_or(30).clamp(10, 300))
}

pub fn set_launch_settings(app: &AppHandle, mode: &str, timeout: u64) -> Result<(), String> {
    let mode = match mode {
        "launcher" => "launcher",
        "shell" => "shell",
        "manual" => "manual",
        _ => "direct",
    };
    let mut cfg = load(app);
    cfg.launch_mode = Some(mode.to_string());
    cfg.launch_timeout = Some(timeout.clamp(10, 300));
    cfg.updated = now_secs();
    store(app, &cfg)
}

/// 注入方式（direct | hook）
pub fn inject_mode(app: &AppHandle) -> String {
    let cfg = load(app);
    match cfg.inject_mode.as_deref() {
        Some("hook") => "hook".to_string(),
        _ => "direct".to_string(),
    }
}

pub fn set_inject_mode(app: &AppHandle, mode: &str) -> Result<(), String> {
    let mode = match mode {
        "hook" => "hook",
        _ => "direct",
    };
    let mut cfg = load(app);
    cfg.inject_mode = Some(mode.to_string());
    cfg.updated = now_secs();
    store(app, &cfg)
}

/// 记录在线更新后的 3DMigoto 版本
pub fn set_loader_version(app: &AppHandle, version: &str) -> Result<(), String> {
    let mut cfg = load(app);
    cfg.loader_version = Some(version.to_string());
    cfg.updated = now_secs();
    store(app, &cfg)
}

/// 刷新 updated 时间戳（由更新流程调用）
pub fn set_updated(app: &AppHandle) {
    let mut cfg = load(app);
    cfg.updated = now_secs();
    let _ = store(app, &cfg);
}
