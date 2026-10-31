use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

const DISABLED_PREFIX: &str = "DISABLED_";

/// Mod / ShaderFixes 都在 NSMMI 侧的工作目录里（注入式加载，游戏目录零文件），
/// 因此这里忽略传入的游戏目录，统一指向 3Dm 工作目录
fn work_dir(_game_root: &Path) -> PathBuf {
    crate::paths::d3m_dir()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModInfo {
    /// 相对 Mod 目录的路径（POSIX 分隔符）
    pub name: String,
    /// 文件绝对路径
    pub path: String,
    pub enabled: bool,
    pub size: u64,
}

/// 列出游戏目录 Mod 下所有 .ini（递归），停用 = DISABLED_ 前缀
pub fn list_mods(game_root: &Path) -> Result<Vec<ModInfo>, String> {
    let root = work_dir(game_root).join("Mod");
    if !root.is_dir() {
        return Ok(Vec::new());
    }

    let mut items: Vec<ModInfo> = Vec::new();
    collect_mods(&root, &root, &mut items)?;
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(items)
}

fn collect_mods(dir: &Path, root: &Path, out: &mut Vec<ModInfo>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("读取目录失败 {}: {}", dir.display(), e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_mods(&path, root, out)?;
            continue;
        }
        if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("ini"))
            != Some(true)
        {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy().to_string();
        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

        out.push(ModInfo {
            enabled: !file_name.starts_with(DISABLED_PREFIX),
            name: relative,
            path: path.to_string_lossy().to_string(),
            size,
        });
    }

    Ok(())
}

/// 切换单个 mod 的启用状态（重命名加/去 DISABLED_ 前缀）
pub fn toggle_mod(game_root: &Path, name: &str) -> Result<Vec<ModInfo>, String> {
    let relative = name.replace('/', "\\");
    let target = work_dir(game_root).join("Mod").join(&relative);

    if !target.is_file() {
        return Err(format!("未找到 mod 文件: {}", name));
    }

    let file_name = target
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| "文件名无效".to_string())?;
    let enabled = !file_name.starts_with(DISABLED_PREFIX);

    let new_file_name = if enabled {
        format!("{}{}", DISABLED_PREFIX, file_name)
    } else {
        file_name
            .strip_prefix(DISABLED_PREFIX)
            .unwrap_or(&file_name)
            .to_string()
    };

    let parent = target
        .parent()
        .ok_or_else(|| "路径无效".to_string())?
        .to_path_buf();
    let new_path = parent.join(&new_file_name);

    if new_path.exists() {
        return Err(format!("目标文件已存在: {}", new_file_name));
    }

    fs::rename(&target, &new_path)
        .map_err(|e| format!("重命名 {} 失败: {}", file_name, e))?;

    list_mods(game_root)
}

/// 打开系统文件管理器（Windows 使用 explorer，其他平台交给 opener 插件）
pub fn mods_dir(game_root: &Path) -> PathBuf {
    work_dir(game_root).join("Mod")
}

pub fn shaderfixes_dir(game_root: &Path) -> PathBuf {
    work_dir(game_root).join("ShaderFixes")
}
