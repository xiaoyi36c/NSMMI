use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// 应用配置目录（Windows 下为 %APPDATA%\NSMMI）
pub fn config_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default())
}

pub fn config_file(app: &AppHandle) -> PathBuf {
    config_dir(app).join("config.json")
}

/// 定位随安装包分发的 Resources 目录：
/// 打包后位于 <resource_dir>/Resources，开发期回退到 <src-tauri>/../Resources
pub fn resources_dir(app: &AppHandle) -> PathBuf {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("Resources"));
        candidates.push(resource_dir.join("..").join("Resources"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("Resources"));
            candidates.push(dir.join("..").join("Resources"));
        }
    }
    candidates.push(PathBuf::from("Resources"));

    for candidate in candidates {
        if candidate.join("Loader").is_dir() || candidate.join("Mods").is_dir() {
            return candidate;
        }
    }

    PathBuf::from("Resources")
}
