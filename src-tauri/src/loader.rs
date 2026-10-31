//! 3DMigoto 加载器版本检测与在线更新
//!
//! 检测 bo3b/3Dmigoto 的最新 Release；更新包解压到应用配置目录下的
//! Loader\（打包后资源目录只读，应用数据目录可写），安装时优先使用。

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::AppHandle;

use crate::config;
use crate::net;
use crate::paths;

/// 随应用分发的 3DMigoto 版本
pub const BUNDLED_LOADER_VERSION: &str = "1.4.9";

const LOADER_FILES: [&str; 4] = [
    "d3d11.dll",
    "d3dcompiler_46.dll",
    "d3dcompiler_47.dll",
    "d3dx.ini",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    pub latest: Option<String>,
    pub has_update: bool,
    pub asset_name: Option<String>,
    pub asset_url: Option<String>,
    pub checking: bool,
}

/// 当前生效的 3DMigoto 版本（已在线更新 > 随包版本）
pub fn installed_version(app: &AppHandle) -> String {
    config::load(app)
        .loader_version
        .unwrap_or_else(|| BUNDLED_LOADER_VERSION.to_string())
}

/// 在线更新的加载器目录（存在且含 d3d11.dll 时优先于随包资源）
pub fn updated_loader_dir(app: &AppHandle) -> PathBuf {
    paths::config_dir(app).join("Loader")
}

fn version_tuple(version: &str) -> Vec<u64> {
    version
        .trim()
        .trim_start_matches(['v', 'V'])
        .split('.')
        .map(|part| part.chars().take_while(|c| c.is_ascii_digit()).collect::<String>())
        .map(|digits| digits.parse::<u64>().unwrap_or(0))
        .collect()
}

fn newer(latest: &str, current: &str) -> bool {
    version_tuple(latest) > version_tuple(current)
}

/// 检查 3DMigoto 更新
pub fn check(app: &AppHandle) -> Result<UpdateInfo, String> {
    let release = net::fetch_latest_release()?;
    let latest = release.tag_name.trim().trim_start_matches(['v', 'V']).to_string();

    // 优先 x64 预编译 zip，其次任意 zip
    let asset = release
        .assets
        .iter()
        .find(|a| {
            let name = a.name.to_lowercase();
            name.contains("x64") && name.ends_with(".zip")
        })
        .or_else(|| {
            release
                .assets
                .iter()
                .find(|a| a.name.to_lowercase().ends_with(".zip"))
        });

    Ok(UpdateInfo {
        current: installed_version(app),
        latest: Some(latest.clone()),
        has_update: newer(&latest, &installed_version(app)),
        asset_name: asset.map(|a| a.name.clone()),
        asset_url: asset.map(|a| a.browser_download_url.clone()),
        checking: false,
    })
}

/// 下载并解压最新加载器到应用数据目录
pub fn update(app: &AppHandle) -> Result<Vec<String>, String> {
    let info = check(app)?;
    if !info.has_update {
        return Ok(vec![format!(
            "3DMigoto 已是最新版本 {}",
            info.current
        )]);
    }
    let url = info
        .asset_url
        .ok_or_else(|| format!("3DMigoto {} 未提供可下载的 zip 资产", info.latest.clone().unwrap_or_default()))?;
    let latest = info.latest.clone().unwrap_or_default();

    let tmp = std::env::temp_dir().join(format!("nsmmi-3dmigoto-{}.zip", latest));
    net::download_to(&url, &tmp).map_err(|e| format!("下载 3DMigoto {} 失败: {}", latest, e))?;

    let dest = updated_loader_dir(app);
    fs::create_dir_all(&dest).map_err(|e| format!("创建加载器目录失败: {}", e))?;

    let file = fs::File::open(&tmp).map_err(|e| format!("打开下载文件失败: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("读取 zip 失败: {}", e))?;

    let mut extracted: Vec<String> = Vec::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("读取 zip 条目失败: {}", e))?;
        if entry.is_dir() {
            continue;
        }
        let file_name = entry
            .name()
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or("")
            .to_lowercase();
        if !LOADER_FILES.contains(&file_name.as_str()) {
            continue;
        }
        let mut out = fs::File::create(dest.join(&file_name))
            .map_err(|e| format!("写入 {} 失败: {}", file_name, e))?;
        std::io::copy(&mut entry, &mut out)
            .map_err(|e| format!("解压 {} 失败: {}", file_name, e))?;
        extracted.push(file_name);
    }

    let _ = fs::remove_file(&tmp);

    if !dest.join("d3d11.dll").is_file() {
        return Err("下载的压缩包中未找到 d3d11.dll，已放弃更新".to_string());
    }

    config::set_loader_version(app, &latest)?;
    config::set_updated(app);

    let mut log = vec![format!("已下载并更新 3DMigoto 至 {}", latest)];
    log.extend(extracted.iter().map(|f| format!("已更新 {}", f)));
    Ok(log)
}
