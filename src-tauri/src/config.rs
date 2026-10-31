use std::fs;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub game_path: Option<String>,
    /// 自定义背景图的本地绝对路径
    pub wallpaper_path: Option<String>,
    pub version: String,
    pub updated: u64,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            game_path: None,
            wallpaper_path: None,
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
