//! GitHub 访问：3DMigoto 最新 Release 查询与文件下载

use std::fs;
use std::io::Write;
use std::path::Path;

use serde::Deserialize;

const LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/bo3b/3Dmigoto/releases/latest";
const USER_AGENT: &str = "NSMMI-Launcher";

#[derive(Debug, Clone, Deserialize)]
pub struct ReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Release {
    pub tag_name: String,
    pub assets: Vec<ReleaseAsset>,
}

/// 查询 3DMigoto 最新 Release（未认证接口，限流 60 次/小时）
pub fn fetch_latest_release() -> Result<Release, String> {
    let response = ureq::get(LATEST_RELEASE_API)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(20))
        .call()
        .map_err(|e| format!("访问 GitHub 失败: {}", e))?;
    response
        .into_json::<Release>()
        .map_err(|e| format!("解析 GitHub 响应失败: {}", e))
}

/// 下载文件到指定路径
pub fn download_to(url: &str, dest: &Path) -> Result<(), String> {
    let response = ureq::get(url)
        .set("User-Agent", USER_AGENT)
        .timeout(std::time::Duration::from_secs(300))
        .call()
        .map_err(|e| format!("下载失败: {}", e))?;

    let mut reader = response.into_reader();
    let mut file = fs::File::create(dest).map_err(|e| format!("创建文件失败: {}", e))?;
    std::io::copy(&mut reader, &mut file)
        .map_err(|e| format!("写入下载内容失败: {}", e))?;
    file.flush().map_err(|e| format!("写入下载内容失败: {}", e))?;
    let _ = Write::flush(&mut file);
    Ok(())
}
