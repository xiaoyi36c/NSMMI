//! Windows 进程创建（挂起启动）与提权工具
//!
//! 3DMigoto 必须在游戏创建 D3D11 设备**之前**挂上钩子，所以这里用
//! `CREATE_SUSPENDED` 把进程建出来，注入完成后再由调用方 `resume()` 放行。
//!
//! 另外提供提权状态判断（NGP 启动器要求管理员权限，界面据此给提示）。

#[cfg(windows)]
pub use imp::{is_elevated, spawn_suspended, Child};

#[cfg(not(windows))]
pub use stub::{is_elevated, spawn_suspended, Child};

#[cfg(windows)]
mod imp {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::Security::{
        GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
    };
    use windows_sys::Win32::System::Threading::{
        CreateProcessW, GetCurrentProcess, OpenProcessToken, ResumeThread, CREATE_NO_WINDOW,
        CREATE_SUSPENDED, PROCESS_CREATION_FLAGS, PROCESS_INFORMATION, STARTUPINFOW,
    };

    /// 当前进程是否已提权（以管理员身份运行）
    pub fn is_elevated() -> bool {
        unsafe {
            let mut token: HANDLE = std::ptr::null_mut();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                return false;
            }
            let mut elevation: TOKEN_ELEVATION = std::mem::zeroed();
            let mut len = 0u32;
            let ok = GetTokenInformation(
                token,
                TokenElevation,
                &mut elevation as *mut TOKEN_ELEVATION as *mut std::ffi::c_void,
                std::mem::size_of::<TOKEN_ELEVATION>() as u32,
                &mut len,
            );
            CloseHandle(token);
            ok != 0 && elevation.TokenIsElevated != 0
        }
    }

    /// 以挂起状态创建出来的进程（主线程还没运行）
    pub struct Child {
        pub pid: u32,
        process: HANDLE,
        thread: HANDLE,
    }

    impl Child {
        /// 恢复主线程（挂起计数减一）
        pub fn resume(&self) -> Result<(), String> {
            let previous = unsafe { ResumeThread(self.thread) };
            if previous == u32::MAX {
                return Err(format!(
                    "恢复进程主线程失败: {}",
                    std::io::Error::last_os_error()
                ));
            }
            Ok(())
        }
    }

    // 句柄只是内核对象引用，且由 Child 独占持有，跨线程转移不会产生别名
    unsafe impl Send for Child {}

    impl Drop for Child {
        fn drop(&mut self) {
            unsafe {
                if !self.thread.is_null() {
                    CloseHandle(self.thread);
                }
                if !self.process.is_null() {
                    CloseHandle(self.process);
                }
            }
        }
    }

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    /// 拼命令行：`"exe" arg1 arg2`（含空格的参数加引号）
    fn command_line(exe: &Path, args: &[&str]) -> String {
        let mut line = format!("\"{}\"", exe.display());
        for arg in args {
            line.push(' ');
            if arg.contains(' ') {
                line.push('"');
                line.push_str(arg);
                line.push('"');
            } else {
                line.push_str(arg);
            }
        }
        line
    }

    /// 挂起创建进程
    fn create(exe: &Path, work_dir: Option<&Path>, args: &[&str]) -> Result<Child, String> {
        let exe_wide = wide(&exe.to_string_lossy());
        let mut cmd_wide = wide(&command_line(exe, args));
        let dir_wide = work_dir.map(|dir| wide(&dir.to_string_lossy()));

        let mut startup: STARTUPINFOW = unsafe { std::mem::zeroed() };
        startup.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        let flags: PROCESS_CREATION_FLAGS = CREATE_SUSPENDED | CREATE_NO_WINDOW;

        let mut info: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
        let created = unsafe {
            CreateProcessW(
                exe_wide.as_ptr(),
                cmd_wide.as_mut_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                0,
                flags,
                std::ptr::null(),
                dir_wide
                    .as_ref()
                    .map(|dir| dir.as_ptr())
                    .unwrap_or(std::ptr::null()),
                &startup,
                &mut info,
            )
        };

        if created == 0 {
            return Err(format!(
                "创建进程失败（{}）: {}",
                exe.display(),
                std::io::Error::last_os_error()
            ));
        }

        Ok(Child {
            pid: info.dwProcessId,
            process: info.hProcess,
            thread: info.hThread,
        })
    }

    /// 挂起启动（`args` 为附加命令行参数，例如客户端要求的 `-ngp`）
    pub fn spawn_suspended(exe: &Path, work_dir: Option<&Path>, args: &[&str]) -> Result<Child, String> {
        if !exe.is_file() {
            return Err(format!("启动文件不存在: {}", exe.display()));
        }
        create(exe, work_dir, args)
    }
}

#[cfg(not(windows))]
mod stub {
    use std::path::Path;

    pub struct Child {
        pub pid: u32,
    }

    impl Child {
        pub fn resume(&self) -> Result<(), String> {
            Err("挂起启动仅支持 Windows".to_string())
        }
    }

    pub fn spawn_suspended(_exe: &Path, _work_dir: Option<&Path>, _args: &[&str]) -> Result<Child, String> {
        Err("挂起启动仅支持 Windows".to_string())
    }

    pub fn is_elevated() -> bool {
        false
    }
}
