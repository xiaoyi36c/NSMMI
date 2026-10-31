use std::path::PathBuf;
use std::sync::OnceLock;

use tauri::{AppHandle, Manager};

/// 3DMigoto 工作目录（`d3dx.ini` / `Mod` / `ShaderFixes` 都在这里，游戏目录零文件）
static D3M_DIR: OnceLock<PathBuf> = OnceLock::new();

/// 应用配置目录（Windows 下为 %APPDATA%\NSMMI）
pub fn config_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default())
}

pub fn config_file(app: &AppHandle) -> PathBuf {
    config_dir(app).join("config.json")
}

/// 3DMigoto 工作目录：`%APPDATA%\NSMMI\Loader`
///
/// 注入式加载的关键：`d3dx.ini` 里的 `include_recursive = Mod`、
/// `override_directory=ShaderFixes` 都是相对 ini 的路径，
/// 因此把工作目录放在应用数据目录即可让 3DMigoto 完全在 NSMMI 侧工作，
/// 游戏目录不需要任何文件。
pub fn d3m_dir() -> PathBuf {
    D3M_DIR.get().cloned().unwrap_or_else(|| {
        // 兜底：初始化前被调用时，退回到 exe 同级目录而不是进程工作目录，
        // 避免在源码目录里长出 Loader\ 之类的脏目录
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().map(|dir| dir.join("Loader")))
            .unwrap_or_else(|| PathBuf::from("Loader"))
    })
}

/// 初始化工作目录（启动时调用一次），并返回该目录
pub fn init_d3m_dir(app: &AppHandle) -> PathBuf {
    let dir = config_dir(app).join("Loader");
    let _ = std::fs::create_dir_all(&dir);
    let _ = D3M_DIR.set(dir.clone());
    dir
}

/// 加载器目录（与 3Dm 工作目录相同：两者必须是同一个可写目录，
/// 否则注入的 DLL 与 d3dx.ini 会分家，3DMigoto 找不到配置）
pub fn loader_dir(_app: &AppHandle) -> PathBuf {
    d3m_dir()
}

/// 随包的加载器文件来源（只读资源目录）
pub fn bundled_loader_dir(app: &AppHandle) -> PathBuf {
    resources_dir(app).join("Loader")
}

/// 工作目录里的加载器文件是否齐全
pub fn loader_files_ready() -> bool {
    let dir = d3m_dir();
    LOADER_FILES.iter().all(|file| dir.join(file).is_file())
}

/// 加载器所需文件：3DMigoto 1.4.9 本体 + H3DLoader 注入器
const LOADER_FILES: [&str; 6] = [
    "h3dloader.dll",
    "3dmloader.dll",
    "d3d11.dll",
    "d3dcompiler_46.dll",
    "d3dcompiler_47.dll",
    "d3dx.ini",
];

/// 确保工作目录里存在加载器文件：缺失或与随包版本不一致时从资源目录复制
///
/// 用文件大小判断是否需要刷新：随包加载器升级（例如换了配套的 d3d11.dll）后，
/// 工作目录里的旧文件会被自动替换，否则注入的仍是旧 dll。
pub fn ensure_loader_files(app: &AppHandle) -> Result<Vec<String>, String> {
    let dir = d3m_dir();
    let src_dir = bundled_loader_dir(app);
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建 3Dm 工作目录失败: {}", e))?;

    let mut log: Vec<String> = Vec::new();
    for file in LOADER_FILES {
        let src = src_dir.join(file);
        if !src.is_file() {
            return Err(format!("安装包缺少加载器文件: {}", src.display()));
        }
        let dst = dir.join(file);
        let same = dst
            .metadata()
            .ok()
            .zip(src.metadata().ok())
            .map(|(a, b)| a.len() == b.len())
            .unwrap_or(false);
        if same {
            continue;
        }
        std::fs::copy(&src, &dst).map_err(|e| format!("准备 {} 失败: {}", file, e))?;
        log.push(format!("已准备 {}", file));
    }
    log.push(format!("3Dm 工作目录: {}", dir.display()));
    Ok(log)
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
        if candidate.join("Loader").is_dir() || candidate.join("Mod").is_dir() {
            return candidate;
        }
    }

    PathBuf::from("Resources")
}
