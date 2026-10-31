use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::config;
use crate::game::{is_game_running, is_valid_root, GAME_EXE};
use crate::paths;

pub const LOADER_FILES: [&str; 4] = [
    "d3d11.dll",
    "d3dcompiler_46.dll",
    "d3dcompiler_47.dll",
    "d3dx.ini",
];

const NSMMI_DIR: &str = "_NSMMI";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestEntry {
    pub file: String,
    pub had_backup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub nsmmi_version: String,
    pub installed_at: u64,
    pub game_root: String,
    pub files: Vec<ManifestEntry>,
}

pub fn manifest_path(game_root: &Path) -> PathBuf {
    game_root.join(NSMMI_DIR).join("manifest.json")
}

pub fn read_manifest(game_root: &Path) -> Option<Manifest> {
    let raw = fs::read_to_string(manifest_path(game_root)).ok()?;
    serde_json::from_str::<Manifest>(&raw).ok()
}

/// 清单存在且加载器文件齐全才算已安装
pub fn is_installed(game_root: &Path) -> bool {
    match read_manifest(game_root) {
        Some(manifest) => manifest
            .files
            .iter()
            .all(|entry| game_root.join(&entry.file).is_file()),
        None => false,
    }
}

/// 部署加载器 + ShaderFixes + Mods，并记录安装清单
pub fn install(app: &AppHandle, game_root: &Path) -> Result<Vec<String>, String> {
    let mut log: Vec<String> = Vec::new();

    if !is_valid_root(game_root) {
        return Err(format!(
            "未在指定目录找到 {}: {}",
            GAME_EXE,
            game_root.display()
        ));
    }
    if is_game_running() {
        return Err("游戏正在运行，请先退出游戏再安装".to_string());
    }

    let resources = paths::resources_dir(app);
    let loader_dir = resources.join("Loader");
    if !loader_dir.is_dir() {
        return Err(format!("安装包缺少加载器目录: {}", loader_dir.display()));
    }

    let backup_dir = game_root.join(NSMMI_DIR).join("backup");
    fs::create_dir_all(&backup_dir).map_err(|e| format!("创建备份目录失败: {}", e))?;

    let mut entries: Vec<ManifestEntry> = Vec::new();
    for file in LOADER_FILES {
        let src = loader_dir.join(file);
        if !src.is_file() {
            return Err(format!("安装包缺少文件: {}", src.display()));
        }

        let dst = game_root.join(file);
        let mut had_backup = false;
        if dst.is_file() {
            fs::copy(&dst, backup_dir.join(format!("{}.bak", file)))
                .map_err(|e| format!("备份 {} 失败: {}", file, e))?;
            had_backup = true;
            log.push(format!("已备份原版 {}", file));
        }

        fs::copy(&src, &dst).map_err(|e| format!("部署 {} 失败: {}", file, e))?;
        log.push(format!("已部署 {}", file));
        entries.push(ManifestEntry {
            file: file.to_string(),
            had_backup,
        });
    }

    // ShaderFixes：只新增不覆盖，保护用户已有着色器
    let shaderfixes_src = resources.join("ShaderFixes");
    if shaderfixes_src.is_dir() {
        let shaderfixes_dst = game_root.join("ShaderFixes");
        fs::create_dir_all(&shaderfixes_dst)
            .map_err(|e| format!("创建 ShaderFixes 目录失败: {}", e))?;
        for entry in fs::read_dir(&shaderfixes_src)
            .map_err(|e| format!("读取 ShaderFixes 模板失败: {}", e))?
            .flatten()
        {
            let name = entry.file_name();
            let dst = shaderfixes_dst.join(&name);
            if dst.exists() {
                continue;
            }
            if entry.path().is_file() {
                fs::copy(entry.path(), &dst)
                    .map_err(|e| format!("部署 ShaderFixes 文件失败: {}", e))?;
                log.push(format!("已部署 ShaderFixes\\{}", name.to_string_lossy()));
            }
        }
    }

    // Mods：只在不存在时创建，绝不覆盖用户 mod
    let mods_dst = game_root.join("Mods");
    if !mods_dst.is_dir() {
        fs::create_dir_all(&mods_dst).map_err(|e| format!("创建 Mods 目录失败: {}", e))?;
        let readme = resources.join("Mods").join("README.txt");
        if readme.is_file() {
            fs::copy(&readme, mods_dst.join("README.txt"))
                .map_err(|e| format!("写入 Mods 说明失败: {}", e))?;
        }
        log.push("已创建 Mods\\ 目录（mod 的 .ini 放这里即自动加载）".to_string());
    }

    let manifest = Manifest {
        nsmmi_version: env!("CARGO_PKG_VERSION").to_string(),
        installed_at: config::now_secs(),
        game_root: game_root.to_string_lossy().to_string(),
        files: entries,
    };
    let raw = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("生成安装清单失败: {}", e))?;
    fs::write(manifest_path(game_root), raw).map_err(|e| format!("写入安装清单失败: {}", e))?;

    config::save_game_path(app, &game_root.to_string_lossy())?;
    log.push(format!("安装完成: {}", game_root.display()));
    Ok(log)
}

/// 按安装清单精确还原/删除，ShaderFixes 与 Mods 中的用户文件保留
pub fn uninstall(game_root: &Path) -> Result<Vec<String>, String> {
    let mut log: Vec<String> = Vec::new();

    let manifest = read_manifest(game_root).ok_or_else(|| {
        format!(
            "未在 {} 找到 NSMMI 安装记录",
            game_root.display()
        )
    })?;
    if is_game_running() {
        return Err("游戏正在运行，请先退出游戏再卸载".to_string());
    }

    let backup_dir = game_root.join(NSMMI_DIR).join("backup");
    for entry in &manifest.files {
        let dst = game_root.join(&entry.file);
        let backup = backup_dir.join(format!("{}.bak", entry.file));

        if entry.had_backup && backup.is_file() {
            fs::copy(&backup, &dst)
                .map_err(|e| format!("还原 {} 失败: {}", entry.file, e))?;
            log.push(format!("已还原 {}（原版备份）", entry.file));
        } else if dst.is_file() {
            fs::remove_file(&dst).map_err(|e| format!("删除 {} 失败: {}", entry.file, e))?;
            log.push(format!("已删除 {}", entry.file));
        }
    }

    let manifest_file = manifest_path(game_root);
    if manifest_file.is_file() {
        fs::remove_file(&manifest_file).ok();
    }

    log.push("卸载完成：ShaderFixes\\ 与 Mods\\ 中的用户文件已保留".to_string());
    log.push(
        "原版备份保留于 _NSMMI\\backup\\，确认游戏正常后可手动删除整个 _NSMMI 目录".to_string(),
    );
    Ok(log)
}

/// 启动游戏（需已安装）
pub fn launch_game(game_root: &Path) -> Result<Vec<String>, String> {
    if !is_valid_root(game_root) {
        return Err(format!(
            "未在指定目录找到 {}: {}",
            GAME_EXE,
            game_root.display()
        ));
    }
    if is_game_running() {
        return Ok(vec!["游戏已在运行中".to_string()]);
    }
    if !is_installed(game_root) {
        return Err("尚未安装 NSMMI，请先安装".to_string());
    }

    let exe = game_root.join(GAME_EXE);
    std::process::Command::new(&exe)
        .current_dir(game_root)
        .spawn()
        .map_err(|e| format!("启动 {} 失败: {}", exe.display(), e))?;

    Ok(vec![
        format!("已启动游戏: {}", exe.display()),
        "提醒: 请自行评估反作弊风险，仅用于合规场景。".to_string(),
    ])
}
