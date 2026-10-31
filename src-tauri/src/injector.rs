//! `H3DLoader.dll` 注入封装（本项目自带注入器）
//!
//! 两种注入方式，ABI 与 3dmloader.dll 兼容：
//!
//! - **Direct**：`Inject(pid, dll_path, timeout)` → 远程线程 `LoadLibraryW`
//! - **Hook**：`HookLibrary(dll_path, &hook, &mutex)` + `WaitForInjection(dll_path, 进程名, timeout)`
//!   → `SetWindowsHookExW` 把 `H3DLoader.dll` 送进目标进程，钩子回调里加载载荷
//!
//! 加载器**不进入游戏目录**：由注入器把 `d3d11.dll` 注入游戏进程，游戏目录保持原版。
//!
//! 找不到 `h3dloader.dll` 时回退到旧的 `3dmloader.dll`（只支持 Direct）。

use std::path::{Path, PathBuf};

#[cfg(windows)]
pub use imp::{diagnostics, inject, Hook};
#[cfg(not(windows))]
pub use stub::{diagnostics, inject, Hook};

/// 注入器文件名（随包资源 / 工作目录）
pub const INJECTOR_DLL: &str = "h3dloader.dll";

/// 旧注入器（兼容回退，只支持 Direct）
pub const LEGACY_INJECTOR_DLL: &str = "3dmloader.dll";

/// 注入方式（与配置里的 `inject_mode` 对应）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InjectMode {
    /// 远程线程注入：知道 pid，能挂起就挂起，抢在 D3D11 设备创建之前
    Direct,
    /// 全局钩子注入：不碰进程，靠窗口消息把 dll 送进去
    Hook,
}

impl InjectMode {
    pub fn parse(raw: &str) -> Self {
        match raw {
            "hook" => Self::Hook,
            _ => Self::Direct,
        }
    }
}

/// 实际可用的注入器：优先 H3DLoader，其次旧的 3dmloader
pub fn resolve(loader_dir: &Path) -> Option<(PathBuf, bool)> {
    let ours = loader_dir.join(INJECTOR_DLL);
    if ours.is_file() {
        return Some((ours, true));
    }
    let legacy = loader_dir.join(LEGACY_INJECTOR_DLL);
    if legacy.is_file() {
        return Some((legacy, false));
    }
    None
}

#[cfg(windows)]
mod imp {
    use std::ffi::{c_void, OsStr};
    use std::os::windows::ffi::OsStrExt;
    use std::path::{Path, PathBuf};

    use windows_sys::Win32::Foundation::FreeLibrary;
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW, SetDllDirectoryW};

    type Hmodule = *mut c_void;
    type Farproc = unsafe extern "system" fn() -> isize;

    type FnInject = unsafe extern "system" fn(u32, *const u16, i32) -> i32;
    type FnSetHookTarget = unsafe extern "system" fn(*const u16) -> i32;
    type FnHookLibrary = unsafe extern "system" fn(*const u16, *mut *mut c_void, *mut *mut c_void) -> i32;
    type FnWaitForInjection = unsafe extern "system" fn(*const u16, *const u16, i32) -> i32;
    type FnUnhookLibrary = unsafe extern "system" fn(*mut *mut c_void, *mut *mut c_void) -> i32;
    type FnDiagnostics = unsafe extern "system" fn(*mut u32, *mut u32, *mut u32) -> i32;

    fn wide(path: &Path) -> Vec<u16> {
        OsStr::new(path.as_os_str())
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    fn wide_str(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn last_error() -> String {
        format!("系统错误码 {}", std::io::Error::last_os_error())
    }

    unsafe fn load_injector(path: &Path) -> Result<Hmodule, String> {
        if !path.is_file() {
            return Err(format!("缺少注入器文件: {}", path.display()));
        }
        let module = LoadLibraryW(wide(path).as_ptr());
        if module.is_null() {
            return Err(format!("加载 {} 失败（{}）", path.display(), last_error()));
        }
        Ok(module)
    }

    unsafe fn proc(module: Hmodule, name: &[u8]) -> Option<Farproc> {
        let addr = GetProcAddress(module, name.as_ptr());
        addr
    }

    /// `Inject` 返回值 → 中文说明（与 H3DLoader / 3dmloader 的错误码一致）
    fn inject_error_text(code: i32) -> String {
        match code {
            100 => "未找到目标进程".to_string(),
            110 => "待注入的 dll 路径无效".to_string(),
            120 => "无法在目标进程中定位 kernel32.dll".to_string(),
            130 => "无法在目标进程中定位 LoadLibraryW".to_string(),
            200 => "在目标进程中分配内存失败".to_string(),
            300 => "向目标进程写入 dll 路径失败".to_string(),
            400 => "在目标进程中创建远程线程失败（可能被反作弊拦截）".to_string(),
            500 => "注入线程超时".to_string(),
            510 => "等待注入线程结束失败".to_string(),
            600 => "目标进程加载 dll 失败（DllMain 返回失败）".to_string(),
            700 => "未知的底层错误".to_string(),
            other => format!("注入器返回未知错误码 {}", other),
        }
    }

    fn hook_error_text(code: i32) -> String {
        match code {
            100 => "已有一个注入钩子实例在运行".to_string(),
            200 => "待注入的 dll 不存在或无法读取".to_string(),
            300 => "缺少 dll 路径参数".to_string(),
            400 => "安装窗口钩子失败（可能被安全软件拦截）".to_string(),
            other => format!("钩子注入失败（错误码 {}）", other),
        }
    }

    /// Direct 注入：在目标进程内 `LoadLibraryW` 待注入 dll
    pub fn inject(
        loader_dir: &Path,
        pid: u32,
        dll_name: &str,
        timeout_secs: u32,
    ) -> Result<String, String> {
        let dll_path = loader_dir.join(dll_name);
        if !dll_path.is_file() {
            return Err(format!("缺少待注入的加载器: {}", dll_path.display()));
        }
        let Some((injector_path, _)) = super::resolve(loader_dir) else {
            return Err(format!(
                "缺少注入器 {}（或旧版 {}）",
                super::INJECTOR_DLL,
                super::LEGACY_INJECTOR_DLL
            ));
        };

        unsafe {
            let module = load_injector(&injector_path)?;
            let Some(entry) = proc(module, b"Inject\0") else {
                FreeLibrary(module);
                return Err(format!(
                    "{} 缺少导出 `Inject`",
                    injector_path.display()
                ));
            };
            let inject_fn: FnInject = std::mem::transmute(entry);

            // 让 d3dcompiler_46/47 等依赖能从加载器目录解析
            let dir_wide = wide(loader_dir);
            SetDllDirectoryW(dir_wide.as_ptr());

            let code = inject_fn(pid, wide(&dll_path).as_ptr(), timeout_secs as i32);

            SetDllDirectoryW(std::ptr::null());
            FreeLibrary(module);

            if code != 0 {
                return Err(format!(
                    "注入 {} 失败: {}（错误码 {}）",
                    dll_path.display(),
                    inject_error_text(code),
                    code
                ));
            }
        }

        Ok(format!(
            "已注入 3DMigoto（Direct，目标 pid={}，加载器 {}）",
            pid,
            dll_path.display()
        ))
    }

    /// 一条已安装的全局钩子（Drop 时自动卸载）
    pub struct Hook {
        module: Hmodule,
        hook: *mut c_void,
        mutex: *mut c_void,
        dll_path: PathBuf,
        target: String,
        uninject: Option<FnUnhookLibrary>,
    }

    impl Hook {
        /// 安装钩子（此时还不会注入，等目标进程出现并处理窗口消息）
        pub fn install(loader_dir: &Path, dll_name: &str, target_exe: &str) -> Result<Self, String> {
            let dll_path = loader_dir.join(dll_name);
            if !dll_path.is_file() {
                return Err(format!("缺少待注入的加载器: {}", dll_path.display()));
            }
            let Some((injector_path, ours)) = super::resolve(loader_dir) else {
                return Err("缺少注入器 dll".to_string());
            };
            if !ours {
                return Err(format!(
                    "Hook 注入需要 {}（旧版 3dmloader 不支持）",
                    super::INJECTOR_DLL
                ));
            }

            unsafe {
                let module = load_injector(&injector_path)?;
                let hook_fn: FnHookLibrary = match proc(module, b"HookLibrary\0") {
                    Some(f) => std::mem::transmute(f),
                    None => {
                        FreeLibrary(module);
                        return Err(format!("{} 缺少导出 `HookLibrary`", injector_path.display()));
                    }
                };
                if proc(module, b"WaitForInjection\0").is_none() {
                    FreeLibrary(module);
                    return Err(format!(
                        "{} 缺少导出 `WaitForInjection`",
                        injector_path.display()
                    ));
                }

                let uninject: Option<FnUnhookLibrary> =
                    proc(module, b"UnhookLibrary\0").map(|f| std::mem::transmute(f));

                // 先把目标进程名写进共享配置（钩子随时可能回调）
                if let Some(set_target) = proc(module, b"SetHookTarget\0") {
                    let set_target: FnSetHookTarget = std::mem::transmute(set_target);
                    let target_wide = wide_str(&target_exe.to_lowercase());
                    let code = set_target(target_wide.as_ptr());
                    if code != 0 {
                        FreeLibrary(module);
                        return Err(format!("设置钩子目标失败: {}", hook_error_text(code)));
                    }
                }

                let mut hook: *mut c_void = std::ptr::null_mut();
                let mut mutex: *mut c_void = std::ptr::null_mut();
                let code = hook_fn(wide(&dll_path).as_ptr(), &mut hook, &mut mutex);
                if code != 0 {
                    FreeLibrary(module);
                    return Err(format!("安装注入钩子失败: {}", hook_error_text(code)));
                }

                Ok(Hook {
                    module,
                    hook,
                    mutex,
                    dll_path,
                    target: target_exe.to_lowercase(),
                    uninject,
                })
            }
        }

        /// 等钩子把 dll 送进目标进程
        pub fn wait(&self, timeout_secs: u32) -> Result<String, String> {
            unsafe {
                let Some(entry) = proc(self.module, b"WaitForInjection\0") else {
                    return Err("注入器缺少 `WaitForInjection`".to_string());
                };
                let wait_fn: FnWaitForInjection = std::mem::transmute(entry);

                let dir_wide = wide(self.dll_path.parent().unwrap_or(Path::new(".")));
                SetDllDirectoryW(dir_wide.as_ptr());
                let code = wait_fn(
                    wide(&self.dll_path).as_ptr(),
                    wide_str(&self.target).as_ptr(),
                    timeout_secs as i32,
                );
                SetDllDirectoryW(std::ptr::null());

                if code != 0 {
                    let (stage, calls, error) = super::diagnostics(
                        self.dll_path.parent().unwrap_or(Path::new(".")),
                    )
                    .unwrap_or((0, 0, 0));
                    let stage_text = match stage {
                        0 => "钩子回调未触发（目标进程可能没有 UI 消息）",
                        1 => "钩子已触发但未完成判定",
                        2 => "钩子触发在其它进程，目标进程名不匹配",
                        3 => "已命中目标进程，正在加载 dll",
                        4 => "dll 已加载",
                        5 => "dll 加载失败",
                        _ => "未知阶段",
                    };
                    return Err(format!(
                        "等待注入超时（{}；回调 {} 次，阶段 {}，系统错误 {}）",
                        stage_text, calls, stage, error
                    ));
                }

                Ok(format!(
                    "已注入 3DMigoto（Hook，目标 {}，加载器 {}）",
                    self.target,
                    self.dll_path.display()
                ))
            }
        }

    }

    impl Drop for Hook {
        fn drop(&mut self) {
            unsafe {
                if let Some(unhook) = self.uninject {
                    unhook(&mut self.hook, &mut self.mutex);
                }
                if !self.module.is_null() {
                    FreeLibrary(self.module);
                }
            }
        }
    }

    /// 诊断信息：钩子回调阶段 / 调用次数 / 最近错误
    pub fn diagnostics(loader_dir: &Path) -> Option<(u32, u32, u32)> {
        let (injector_path, ours) = super::resolve(loader_dir)?;
        if !ours {
            return None;
        }
        unsafe {
            let module = load_injector(&injector_path).ok()?;
            let entry = proc(module, b"H3DLoaderDiagnostics\0");
            let mut stage = 0u32;
            let mut calls = 0u32;
            let mut error = 0u32;
            let result = match entry {
                Some(f) => {
                    let diag: FnDiagnostics = std::mem::transmute(f);
                    diag(&mut stage, &mut calls, &mut error) == 0
                }
                None => false,
            };
            FreeLibrary(module);
            if result {
                Some((stage, calls, error))
            } else {
                None
            }
        }
    }
}

#[cfg(not(windows))]
mod stub {
    use std::path::Path;

    pub struct Hook;

    impl Hook {
        pub fn install(_loader_dir: &Path, _dll_name: &str, _target_exe: &str) -> Result<Self, String> {
            Err("仅支持 Windows".to_string())
        }

        pub fn wait(&self, _timeout_secs: u32) -> Result<String, String> {
            Err("仅支持 Windows".to_string())
        }

        pub fn target(&self) -> &str {
            ""
        }
    }

    pub fn inject(
        _loader_dir: &Path,
        _pid: u32,
        _dll_name: &str,
        _timeout_secs: u32,
    ) -> Result<String, String> {
        Err("注入仅支持 Windows".to_string())
    }

    pub fn diagnostics(_loader_dir: &Path) -> Option<(u32, u32, u32)> {
        None
    }
}
