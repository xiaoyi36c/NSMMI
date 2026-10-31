//! 3DMigoto 调试开关：读写 NSMMI 工作目录下的 d3dx.ini
//!
//! 注入式加载下 ini 在 NSMMI 侧（`%APPDATA%\NSMMI\Loader\d3dx.ini`），
//! 游戏目录零文件。
//!
//! - 狩猎模式：[Hunting] hunting = 2（0 为关闭），游戏内标记着色用于定位模型
//! - 详细日志：[Logging] log = 2（0 为关闭），输出警告与错误日志

use std::fs;
use std::path::Path;

const INI_FILE: &str = "d3dx.ini";

#[derive(Debug, Clone, serde::Serialize)]
pub struct DebugState {
    pub hunting: bool,
    pub logging: bool,
}

fn ini_path(_game_root: &Path) -> std::path::PathBuf {
    crate::paths::d3m_dir().join(INI_FILE)
}

fn read_ini(game_root: &Path) -> Result<String, String> {
    fs::read_to_string(ini_path(game_root)).map_err(|_| {
        "未找到 d3dx.ini，请先在「设置」中点「安装 / 更新」准备工作目录".to_string()
    })
}

/// 读取当前调试开关状态
pub fn read_state(game_root: &Path) -> Result<DebugState, String> {
    let raw = read_ini(game_root)?;
    Ok(DebugState {
        hunting: value_enabled(&raw, "Hunting", "hunting"),
        logging: value_enabled(&raw, "Logging", "log"),
    })
}

/// 设置调试开关并返回新状态
pub fn set_option(game_root: &Path, option: &str, enabled: bool) -> Result<DebugState, String> {
    let (section, key, value) = match option {
        "hunting" => ("Hunting", "hunting", if enabled { "2" } else { "0" }),
        "logging" => ("Logging", "log", if enabled { "2" } else { "0" }),
        _ => return Err("未知的调试选项".to_string()),
    };

    let raw = read_ini(game_root)?;
    let updated = set_ini_value(&raw, section, key, value);
    fs::write(ini_path(game_root), updated).map_err(|e| format!("写入 d3dx.ini 失败: {}", e))?;
    read_state(game_root)
}

fn is_enabled(value: &str) -> bool {
    !value.is_empty() && value != "0"
}

/// 读取 [section] 下 key 的当前值（跳过注释行）
fn current_value(raw: &str, section: &str, key: &str) -> Option<String> {
    let mut in_section = false;
    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_section = trimmed.eq_ignore_ascii_case(&format!("[{}]", section));
            continue;
        }
        if in_section && !trimmed.starts_with(';') && !trimmed.starts_with('#') {
            if let Some((k, v)) = split_kv(trimmed) {
                if k.eq_ignore_ascii_case(key) {
                    return Some(v.to_string());
                }
            }
        }
    }
    None
}

fn value_enabled(raw: &str, section: &str, key: &str) -> bool {
    current_value(raw, section, key).map_or(false, |v| is_enabled(&v))
}

fn split_kv(line: &str) -> Option<(&str, &str)> {
    let (k, v) = line.split_once('=')?;
    Some((k.trim(), v.trim()))
}

/// 逐行改写目标 key：取消注释、替换值；不存在则在节尾/文件尾插入
fn set_ini_value(raw: &str, section: &str, key: &str, value: &str) -> String {
    let section_header = format!("[{}]", section);
    let mut out: Vec<String> = Vec::new();
    let mut in_section = false;
    let mut replaced = false;

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            // 目标节结束且没找到 key：插到节尾
            if in_section && !replaced {
                out.push(format!("{} = {}", key, value));
                replaced = true;
            }
            in_section = trimmed.eq_ignore_ascii_case(&section_header);
            out.push(line.to_string());
            continue;
        }
        if in_section && !replaced {
            // 命中定义行（含被注释的定义行，直接取消注释并赋值）
            let uncommented = trimmed.trim_start_matches([';', '#']).trim();
            if let Some((k, _)) = split_kv(uncommented) {
                if k.eq_ignore_ascii_case(key) {
                    out.push(format!("{} = {}", key, value));
                    replaced = true;
                    continue;
                }
            }
        }
        out.push(line.to_string());
    }

    if !replaced {
        if in_section {
            out.push(format!("{} = {}", key, value));
        } else {
            out.push(String::new());
            out.push(section_header);
            out.push(format!("{} = {}", key, value));
        }
    }

    let mut result = out.join("\r\n");
    if raw.ends_with('\n') {
        result.push('\n');
    }
    result
}
