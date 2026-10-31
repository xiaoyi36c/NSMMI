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

/// 加载器来源目录：优先使用在线更新后的 Loader\（应用数据目录），
/// 否则回退到随包 Resources\Loader
pub fn loader_dir(app: &AppHandle) -> PathBuf {
    let updated = config_dir(app).join("Loader");
    if updated.join("d3d11.dll").is_file() {
        return updated;
    }
    resources_dir(app).join("Loader")
}

/// 定位随安装包分发的 Resources 目录：
/// 打包后位于 <resource_dir>/Resources；开发期 exe 在 src-tauri/target/debug/，
/// 需向上逐级回退到项目根的 Resources
pub fn resources_dir(app: &AppHandle) -> PathBuf {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("Resources"));
        // 开发期 resource_dir = target/debug：逐级向上覆盖到项目根
        let mut parent = resource_dir.clone();
        for _ in 0..4 {
            parent = parent.join("..");
            candidates.push(parent.join("Resources"));
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("Resources"));
            let mut parent = dir.to_path_buf();
            for _ in 0..4 {
                parent = parent.join("..");
                candidates.push(parent.join("Resources"));
            }
        }
    }
    // 工作目录兜底
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("Resources"));
        let mut parent = cwd;
        for _ in 0..2 {
            parent = parent.join("..");
            candidates.push(parent.join("Resources"));
        }
    }

    for candidate in candidates {
        if candidate.join("Loader").is_dir() || candidate.join("Mods").is_dir() {
            return candidate;
        }
    }

    PathBuf::from("Resources")
}
