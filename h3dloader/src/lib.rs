//! H3DLoader —— NSMMI 自带的 DLL 注入器
//!
//! 两种注入方式，导出 ABI 与 3dmloader.dll 保持一致（NSMMI 可无缝切换）：
//!
//! | 导出 | 方式 | 说明 |
//! | --- | --- | --- |
//! | [`Inject`] | Direct | `OpenProcess` + `VirtualAllocEx` + `WriteProcessMemory` + `CreateRemoteThreadEx(LoadLibraryW)` |
//! | [`HookLibrary`] / [`WaitForInjection`] / [`UnhookLibrary`] | Hook | `SetWindowsHookExW(WH_CBT)` 全局钩子：系统把本 dll 映射进目标进程，钩子回调里再加载载荷 |
//!
//! Hook 模式跨进程要传的参数（目标进程名 / 载荷路径 / 结果）放在命名共享内存
//! `Local\H3DLoaderCfg` 里，因此不依赖 dll 内的共享数据段。
//!
//! 返回码沿用 3dmloader 的定义（见 [`codes`]），NSMMI 侧的错误提示不需要改。

#![allow(non_snake_case)]
#![allow(clippy::missing_safety_doc)]

use std::ffi::{c_void, OsString};
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};

use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, SetLastError, ERROR_ALREADY_EXISTS, HANDLE, HINSTANCE, HMODULE,
    INVALID_HANDLE_VALUE, LPARAM, LRESULT, WAIT_OBJECT_0, WAIT_TIMEOUT, WPARAM,
};
use windows_sys::Win32::System::Diagnostics::Debug::{OutputDebugStringW, WriteProcessMemory};
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Module32FirstW, Module32NextW, MODULEENTRY32W, TH32CS_SNAPMODULE,
    TH32CS_SNAPMODULE32,
};
use windows_sys::Win32::System::LibraryLoader::{
    GetModuleFileNameW, GetModuleHandleExW, GetModuleHandleW, GetProcAddress, LoadLibraryExW,
    SetDllDirectoryW, GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, GET_MODULE_HANDLE_EX_FLAG_PIN,
    LOAD_WITH_ALTERED_SEARCH_PATH,
};
use windows_sys::Win32::System::Memory::{
    CreateFileMappingW, MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, VirtualAllocEx,
    VirtualFreeEx, FILE_MAP_ALL_ACCESS, MEM_COMMIT, MEM_RELEASE, MEM_RESERVE,
    MEMORY_MAPPED_VIEW_ADDRESS, PAGE_READWRITE,
};
use windows_sys::Win32::System::Threading::{
    CreateMutexW, CreateProcessW, CreateRemoteThreadEx, GetExitCodeThread, OpenProcess, ResumeThread,
    WaitForSingleObject, CREATE_NO_WINDOW, CREATE_SUSPENDED, PROCESS_CREATION_FLAGS,
    PROCESS_CREATE_THREAD, PROCESS_INFORMATION, PROCESS_QUERY_INFORMATION, PROCESS_VM_OPERATION,
    PROCESS_VM_READ, PROCESS_VM_WRITE, STARTUPINFOW,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, SetWindowsHookExW, UnhookWindowsHookEx, WH_CBT,
};

// ---------------------------------------------------------------------------
// 返回码（与 3dmloader 一致）
// ---------------------------------------------------------------------------

pub mod codes {
    // Inject（Direct）
    pub const OK: i32 = 0;
    pub const PROCESS_NOT_FOUND: i32 = 100;
    pub const INVALID_DLL_PATH: i32 = 110;
    pub const KERNEL32_FAIL: i32 = 120;
    pub const LOADLIBRARY_FAIL: i32 = 130;
    pub const REMOTE_ALLOC_FAIL: i32 = 200;
    pub const WRITE_MEMORY_FAIL: i32 = 300;
    pub const THREAD_FAIL: i32 = 400;
    pub const THREAD_TIMEOUT: i32 = 500;
    pub const THREAD_WAIT_FAIL: i32 = 510;
    pub const INJECTION_FAILED: i32 = 600;
    pub const UNKNOWN: i32 = 700;

    // HookLibrary / WaitForInjection
    pub const HOOK_ALREADY_RUNNING: i32 = 100;
    pub const HOOK_LOAD_FAILED: i32 = 200;
    pub const HOOK_MISSING_ENTRY: i32 = 300;
    pub const HOOK_SETUP_FAILED: i32 = 400;
    pub const HOOK_TIMEOUT: i32 = 1;
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn wide_path(path: &Path) -> Vec<u16> {
    path.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

/// 从 `LPCWSTR` 读字符串（上限 4096 字符，防越界）
unsafe fn from_wide_ptr(ptr: *const u16) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    let mut len = 0usize;
    while len < 4096 && *ptr.add(len) != 0 {
        len += 1;
    }
    if len == 0 {
        return None;
    }
    Some(String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len)))
}

unsafe fn from_wide_ptr_path(ptr: *const u16) -> Option<PathBuf> {
    if ptr.is_null() {
        return None;
    }
    let mut len = 0usize;
    while len < 4096 && *ptr.add(len) != 0 {
        len += 1;
    }
    if len == 0 {
        return None;
    }
    Some(PathBuf::from(OsString::from_wide(std::slice::from_raw_parts(
        ptr, len,
    ))))
}

fn dbg(msg: &str) {
    let text = wide(&format!("[H3DLoader] {msg}"));
    unsafe { OutputDebugStringW(text.as_ptr()) };
}

/// 当前进程 exe 文件名（小写）
fn current_exe_name() -> String {
    let mut buf = [0u16; 1024];
    let len = unsafe { GetModuleFileNameW(std::ptr::null_mut(), buf.as_mut_ptr(), buf.len() as u32) };
    if len == 0 {
        return String::new();
    }
    let path = PathBuf::from(OsString::from_wide(&buf[..len as usize]));
    path.file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Direct：远程线程注入
// ---------------------------------------------------------------------------

fn remote_module_base(pid: u32, module: &str) -> Option<usize> {
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid);
        if snap.is_null() || snap == INVALID_HANDLE_VALUE {
            return None;
        }
        let mut entry: MODULEENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<MODULEENTRY32W>() as u32;
        let want = module.to_lowercase();
        let mut found = None;

        if Module32FirstW(snap, &mut entry) != 0 {
            loop {
                let len = entry
                    .szModule
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szModule.len());
                let name = String::from_utf16_lossy(&entry.szModule[..len]).to_lowercase();
                if name == want {
                    found = Some(entry.modBaseAddr as usize);
                    break;
                }
                if Module32NextW(snap, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snap);
        found
    }
}

/// 本进程里 `module!export` 的地址与模块基址
fn local_export(module: &str, export: &str) -> Option<(usize, usize)> {
    let module_wide = wide(module);
    unsafe {
        let base = GetModuleHandleW(module_wide.as_ptr());
        if base.is_null() {
            return None;
        }
        // GetProcAddress 要的是 ASCII（ANSI）名字
        let mut name: Vec<u8> = export.bytes().collect();
        name.push(0);
        let func = GetProcAddress(base, name.as_ptr())?;
        Some((base as usize, func as usize))
    }
}

/// Direct 注入：在目标进程里远程 `LoadLibraryW(绝对路径)`
pub fn inject(pid: u32, dll: &Path, timeout_secs: i32) -> i32 {
    if !dll.is_file() {
        return codes::INVALID_DLL_PATH;
    }
    let timeout_ms = if timeout_secs <= 0 {
        u32::MAX
    } else {
        (timeout_secs as u32).saturating_mul(1000)
    };

    let access = PROCESS_CREATE_THREAD
        | PROCESS_QUERY_INFORMATION
        | PROCESS_VM_OPERATION
        | PROCESS_VM_WRITE
        | PROCESS_VM_READ;
    let process = unsafe { OpenProcess(access, 0, pid) };
    if process.is_null() {
        return codes::PROCESS_NOT_FOUND;
    }
    let code = unsafe { inject_into_process(process, pid, dll, timeout_ms) };
    unsafe { CloseHandle(process) };
    code
}

unsafe fn inject_into_process(process: HANDLE, pid: u32, dll: &Path, timeout_ms: u32) -> i32 {
    // 1) 目标进程的 kernel32 基址 + 本进程 LoadLibraryW 的 RVA → 远程函数地址
    let Some((local_k32, local_load_library)) = local_export("kernel32.dll", "LoadLibraryW") else {
        return codes::LOADLIBRARY_FAIL;
    };
    let rva = local_load_library - local_k32;
    // 优先按目标进程真实基址算；挂起创建（还没初始化）或受保护进程取不到模块表时，
    // 退回本进程基址：x64 + Win8 起系统 dll 在所有进程里基址一致。
    let remote_k32 = remote_module_base(pid, "kernel32.dll").unwrap_or(local_k32);
    let remote_load_library = (remote_k32 + rva) as *const c_void;

    // 2) 把 dll 路径写进目标进程
    let path = wide_path(dll);
    let size = path.len() * std::mem::size_of::<u16>();
    let remote_mem = VirtualAllocEx(
        process,
        std::ptr::null(),
        size,
        MEM_COMMIT | MEM_RESERVE,
        PAGE_READWRITE,
    );
    if remote_mem.is_null() {
        return codes::REMOTE_ALLOC_FAIL;
    }

    let mut written = 0usize;
    let ok = WriteProcessMemory(
        process,
        remote_mem,
        path.as_ptr() as *const c_void,
        size,
        &mut written,
    );
    if ok == 0 || written != size {
        VirtualFreeEx(process, remote_mem, 0, MEM_RELEASE);
        return codes::WRITE_MEMORY_FAIL;
    }

    // 3) 远程线程里执行 LoadLibraryW
    type ThreadStart = unsafe extern "system" fn(*mut c_void) -> u32;
    let start: ThreadStart = std::mem::transmute(remote_load_library);
    let thread = CreateRemoteThreadEx(
        process,
        std::ptr::null(),
        0,
        Some(start),
        remote_mem,
        0,
        std::ptr::null_mut(),
        std::ptr::null_mut(),
    );
    if thread.is_null() {
        VirtualFreeEx(process, remote_mem, 0, MEM_RELEASE);
        return codes::THREAD_FAIL;
    }

    // 4) 等线程结束：退出码就是 LoadLibraryW 的返回值（0 = DllMain 失败）
    let mut result = codes::OK;
    let wait = WaitForSingleObject(thread, timeout_ms);
    if wait == WAIT_TIMEOUT {
        result = codes::THREAD_TIMEOUT;
    } else if wait != WAIT_OBJECT_0 {
        result = codes::THREAD_WAIT_FAIL;
    } else {
        let mut exit_code: u32 = 0;
        if GetExitCodeThread(thread, &mut exit_code) == 0 {
            result = codes::THREAD_WAIT_FAIL;
        } else if exit_code == 0 {
            result = codes::INJECTION_FAILED;
        }
    }

    CloseHandle(thread);
    VirtualFreeEx(process, remote_mem, 0, MEM_RELEASE);
    result
}

// ---------------------------------------------------------------------------
// Hook：全局窗口钩子注入
// ---------------------------------------------------------------------------

#[repr(C)]
struct HookConfig {
    magic: u32,
    version: u32,
    /// 目标进程 exe 名（小写；空 = 尚未确定）
    target_exe: [u16; 128],
    /// 待加载的 dll 绝对路径
    dll_path: [u16; 520],
    /// 已成功加载载荷的进程 pid（0 = 尚未加载）
    loaded_pid: u32,
    /// 最近一次加载失败的系统错误码（诊断用）
    last_error: u32,
    /// 钩子回调走到哪一步（诊断：0=没触发 1=已进回调 2=进程名不匹配 3=命中 4=加载成功 5=加载失败）
    stage: u32,
    /// 钩子回调被调用的次数
    hook_calls: u32,
}

const CFG_MAGIC: u32 = 0x4833_444C; // 'H3DL'
const CFG_NAME: &str = "Local\\H3DLoaderCfg";
const MUTEX_NAME: &str = "Local\\H3DLoaderInstance";

static HOST_CFG: AtomicIsize = AtomicIsize::new(0);
static HOST_MAPPING: AtomicIsize = AtomicIsize::new(0);
static HOOK_HANDLE: AtomicIsize = AtomicIsize::new(0);
static MUTEX_HANDLE: AtomicIsize = AtomicIsize::new(0);
/// 本进程内是否已尝试加载载荷（注入到目标进程后每个进程各有一份）
static PAYLOAD_TRIED: AtomicBool = AtomicBool::new(false);

unsafe fn unmap(ptr: *const c_void) {
    if !ptr.is_null() {
        UnmapViewOfFile(MEMORY_MAPPED_VIEW_ADDRESS {
            Value: ptr as *mut c_void,
        });
    }
}

/// 一份共享配置视图
struct CfgView {
    cfg: *mut HookConfig,
    mapping: HANDLE,
}

unsafe fn open_cfg(create: bool) -> Option<CfgView> {
    let name = wide(CFG_NAME);
    let size = std::mem::size_of::<HookConfig>();

    let mapping = if create {
        CreateFileMappingW(
            INVALID_HANDLE_VALUE,
            std::ptr::null(),
            PAGE_READWRITE,
            0,
            size as u32,
            name.as_ptr(),
        )
    } else {
        OpenFileMappingW(FILE_MAP_ALL_ACCESS, 0, name.as_ptr())
    };
    if mapping.is_null() {
        return None;
    }

    let view = MapViewOfFile(mapping, FILE_MAP_ALL_ACCESS, 0, 0, size);
    if view.Value.is_null() {
        CloseHandle(mapping);
        return None;
    }

    let cfg = view.Value as *mut HookConfig;
    if create {
        (*cfg).magic = CFG_MAGIC;
        (*cfg).version = 1;
        (*cfg).target_exe = [0; 128];
        (*cfg).dll_path = [0; 520];
        (*cfg).loaded_pid = 0;
        (*cfg).last_error = 0;
        (*cfg).stage = 0;
        (*cfg).hook_calls = 0;
    } else if (*cfg).magic != CFG_MAGIC {
        UnmapViewOfFile(view);
        CloseHandle(mapping);
        return None;
    }

    Some(CfgView { cfg, mapping })
}

unsafe fn close_cfg(view: &CfgView) {
    unmap(view.cfg as *const c_void);
    CloseHandle(view.mapping);
}

unsafe fn field_string(buf: &[u16]) -> String {
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len])
}

unsafe fn write_field(buf: &mut [u16], value: &str) {
    let src: Vec<u16> = value.encode_utf16().collect();
    let len = src.len().min(buf.len().saturating_sub(1));
    buf[..len].copy_from_slice(&src[..len]);
    if len < buf.len() {
        buf[len] = 0;
    }
}

/// 更新共享配置（仅宿主进程调用；视图常驻）
unsafe fn update_config(dll: Option<&Path>, target: Option<&str>) -> bool {
    let mut cfg = HOST_CFG.load(Ordering::SeqCst) as *mut HookConfig;
    if cfg.is_null() {
        let Some(view) = open_cfg(true) else {
            return false;
        };
        HOST_CFG.store(view.cfg as isize, Ordering::SeqCst);
        HOST_MAPPING.store(view.mapping as isize, Ordering::SeqCst);
        cfg = view.cfg;
    }
    if let Some(path) = dll {
        write_field(&mut (*cfg).dll_path, &path.to_string_lossy());
    }
    if let Some(exe) = target {
        write_field(&mut (*cfg).target_exe, &exe.to_lowercase());
    }
    true
}

unsafe fn release_host_cfg() {
    let cfg = HOST_CFG.swap(0, Ordering::SeqCst) as *const HookConfig;
    unmap(cfg as *const c_void);
    let mapping = HOST_MAPPING.swap(0, Ordering::SeqCst) as HANDLE;
    if !mapping.is_null() {
        CloseHandle(mapping);
    }
}

unsafe extern "system" fn hook_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        try_load_payload();
    }
    CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
}

/// 在“自己”所在的进程里判断是否命中目标，命中就加载载荷
unsafe fn try_load_payload() {
    if PAYLOAD_TRIED.load(Ordering::SeqCst) {
        return;
    }
    let Some(view) = open_cfg(false) else {
        return;
    };

    (*view.cfg).hook_calls = (*view.cfg).hook_calls.wrapping_add(1);
    (*view.cfg).stage = 1;

    let target = field_string(&(*view.cfg).target_exe);
    let dll = field_string(&(*view.cfg).dll_path);
    let exe = current_exe_name();
    let hit = !target.is_empty() && !dll.is_empty() && exe == target;

    if !hit {
        (*view.cfg).stage = 2;
        close_cfg(&view);
        return;
    }
    (*view.cfg).stage = 3;
    close_cfg(&view);

    if PAYLOAD_TRIED.swap(true, Ordering::SeqCst) {
        return;
    }

    let pid = std::process::id();
    dbg(&format!("钩子命中 {target}（pid={pid}），准备加载 {dll}"));

    // 钩子回调可能正在 loader lock 里，LoadLibrary 交给独立线程做
    // 先固定本模块，避免 UnhookLibrary 之后本 dll 被卸载而线程还在跑
    let mut self_module: HMODULE = std::ptr::null_mut();
    GetModuleHandleExW(
        GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
        hook_proc as *const c_void as *const u16,
        &mut self_module,
    );

    let dll_path = PathBuf::from(dll);
    std::thread::spawn(move || unsafe {
        if let Some(dir) = dll_path.parent() {
            let dir_wide = wide_path(dir);
            SetDllDirectoryW(dir_wide.as_ptr());
        }
        let path = wide_path(&dll_path);
        let module = LoadLibraryExW(
            path.as_ptr(),
            std::ptr::null_mut(),
            LOAD_WITH_ALTERED_SEARCH_PATH,
        );
        let err = GetLastError();
        SetDllDirectoryW(std::ptr::null());

        if let Some(view) = open_cfg(false) {
            if module.is_null() {
                (*view.cfg).last_error = err;
                (*view.cfg).stage = 5;
                dbg(&format!(
                    "载荷加载失败（pid={}，错误 {}）: {}",
                    std::process::id(),
                    err,
                    dll_path.display()
                ));
            } else {
                (*view.cfg).loaded_pid = std::process::id();
                (*view.cfg).stage = 4;
                dbg(&format!(
                    "载荷已加载（pid={}）: {}",
                    std::process::id(),
                    dll_path.display()
                ));
            }
            close_cfg(&view);
        }
    });
}

// ---------------------------------------------------------------------------
// 导出：Hook 模式
// ---------------------------------------------------------------------------

/// 设置 Hook 的目标进程名（H3DLoader 扩展；3dmloader 只能靠 `WaitForInjection` 事后设置）
#[no_mangle]
pub extern "system" fn SetHookTarget(exe_name: *const u16) -> i32 {
    unsafe {
        let Some(name) = from_wide_ptr(exe_name) else {
            return codes::UNKNOWN;
        };
        if update_config(None, Some(&name)) {
            codes::OK
        } else {
            codes::HOOK_SETUP_FAILED
        }
    }
}

/// 安装全局钩子：`(dll_path, HHOOK* out_hook, HANDLE* out_mutex)`（同 3dmloader）
#[no_mangle]
pub extern "system" fn HookLibrary(
    dll_path: *const u16,
    hook_out: *mut *mut c_void,
    mutex_out: *mut *mut c_void,
) -> i32 {
    unsafe {
        if HOOK_HANDLE.load(Ordering::SeqCst) != 0 {
            return codes::HOOK_ALREADY_RUNNING;
        }
        let Some(path) = from_wide_ptr_path(dll_path) else {
            return codes::HOOK_MISSING_ENTRY;
        };
        if !path.is_file() {
            return codes::HOOK_LOAD_FAILED;
        }

        // 单实例（3dmloader 用 `Local\3DMigotoLoader` 互斥体，这里换成自己的名字）
        // 先清 last error，否则可能读到之前调用遗留的 ERROR_ALREADY_EXISTS
        SetLastError(0);
        let name = wide(MUTEX_NAME);
        let mutex = CreateMutexW(std::ptr::null(), 0, name.as_ptr());
        if mutex.is_null() {
            return codes::HOOK_SETUP_FAILED;
        }
        if GetLastError() == ERROR_ALREADY_EXISTS {
            CloseHandle(mutex);
            return codes::HOOK_ALREADY_RUNNING;
        }

        if !update_config(Some(&path), None) {
            CloseHandle(mutex);
            return codes::HOOK_SETUP_FAILED;
        }

        // 钩子过程必须由本 dll 提供：取本模块句柄
        let mut module: HMODULE = std::ptr::null_mut();
        let ok = GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS,
            hook_proc as *const c_void as *const u16,
            &mut module,
        );
        if ok == 0 {
            CloseHandle(mutex);
            return codes::HOOK_SETUP_FAILED;
        }

        let hook = SetWindowsHookExW(WH_CBT, Some(hook_proc), module as HINSTANCE, 0);
        if hook.is_null() {
            CloseHandle(mutex);
            return codes::HOOK_SETUP_FAILED;
        }

        HOOK_HANDLE.store(hook as isize, Ordering::SeqCst);
        MUTEX_HANDLE.store(mutex as isize, Ordering::SeqCst);
        if !hook_out.is_null() {
            *hook_out = hook;
        }
        if !mutex_out.is_null() {
            *mutex_out = mutex;
        }

        dbg(&format!("钩子已安装，待注入 {}", path.display()));
        codes::OK
    }
}

/// 等钩子把载荷送进目标进程：`(dll_path, target_process, timeout_secs)`，返回 0 = 成功
#[no_mangle]
pub extern "system" fn WaitForInjection(
    dll_path: *const u16,
    target_process: *const u16,
    timeout_secs: i32,
) -> i32 {
    unsafe {
        let path = from_wide_ptr_path(dll_path);
        let target = from_wide_ptr(target_process);
        if !update_config(path.as_deref(), target.as_deref()) {
            return codes::HOOK_SETUP_FAILED;
        }

        let cfg = HOST_CFG.load(Ordering::SeqCst) as *const HookConfig;
        if cfg.is_null() {
            return codes::HOOK_SETUP_FAILED;
        }

        let seconds = if timeout_secs <= 0 { 600 } else { timeout_secs as u64 };
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(seconds);

        loop {
            if (*cfg).loaded_pid != 0 {
                dbg(&format!("注入完成，pid={}", (*cfg).loaded_pid));
                return codes::OK;
            }
            if std::time::Instant::now() >= deadline {
                dbg(&format!("等待注入超时（last_error={}）", (*cfg).last_error));
                return codes::HOOK_TIMEOUT;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }
}

/// 卸载钩子：`(HHOOK*, HANDLE*)`（同 3dmloader）
#[no_mangle]
pub extern "system" fn UnhookLibrary(
    hook_inout: *mut *mut c_void,
    mutex_inout: *mut *mut c_void,
) -> i32 {
    unsafe {
        let hook = if !hook_inout.is_null() && !(*hook_inout).is_null() {
            let value = *hook_inout;
            *hook_inout = std::ptr::null_mut();
            value
        } else {
            HOOK_HANDLE.swap(0, Ordering::SeqCst) as *mut c_void
        };
        HOOK_HANDLE.store(0, Ordering::SeqCst);
        if !hook.is_null() {
            UnhookWindowsHookEx(hook);
        }

        let mutex = if !mutex_inout.is_null() && !(*mutex_inout).is_null() {
            let value = *mutex_inout as HANDLE;
            *mutex_inout = std::ptr::null_mut();
            value
        } else {
            MUTEX_HANDLE.swap(0, Ordering::SeqCst) as HANDLE
        };
        MUTEX_HANDLE.store(0, Ordering::SeqCst);
        if !mutex.is_null() {
            CloseHandle(mutex);
        }

        release_host_cfg();
        dbg("钩子已卸载");
        codes::OK
    }
}

// ---------------------------------------------------------------------------
// 导出：Direct 模式
// ---------------------------------------------------------------------------

/// Direct 注入：`(pid, dll_path, timeout_secs)`（同 3dmloader）
#[no_mangle]
pub extern "system" fn Inject(pid: u32, dll_path: *const u16, timeout_secs: i32) -> i32 {
    let Some(path) = (unsafe { from_wide_ptr_path(dll_path) }) else {
        return codes::INVALID_DLL_PATH;
    };
    let code = inject(pid, &path, timeout_secs);
    if code == codes::OK {
        dbg(&format!("已注入 {} → pid={pid}", path.display()));
    } else {
        dbg(&format!(
            "注入失败 {} → pid={pid}，错误码 {code}",
            path.display()
        ));
    }
    code
}

/// 拉起进程 → 挂起注入 → 恢复（H3DLoader 扩展）
///
/// `cmdline` 为完整命令行；`dll_path` 传空则只启动不注入。
#[no_mangle]
pub extern "system" fn StartProcess(
    cmdline: *const u16,
    dll_path: *const u16,
    timeout_secs: i32,
) -> i32 {
    unsafe {
        let Some(line) = from_wide_ptr(cmdline) else {
            return codes::PROCESS_NOT_FOUND;
        };
        let dll = from_wide_ptr_path(dll_path);
        let mut line_wide = wide(&line);

        let mut startup: STARTUPINFOW = std::mem::zeroed();
        startup.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        let mut info: PROCESS_INFORMATION = std::mem::zeroed();
        let flags: PROCESS_CREATION_FLAGS = CREATE_SUSPENDED | CREATE_NO_WINDOW;

        let created = CreateProcessW(
            std::ptr::null(),
            line_wide.as_mut_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            0,
            flags,
            std::ptr::null(),
            std::ptr::null(),
            &startup,
            &mut info,
        );
        if created == 0 {
            return codes::PROCESS_NOT_FOUND;
        }

        let mut code = codes::OK;
        if let Some(path) = dll {
            if !path.as_os_str().is_empty() {
                let timeout = if timeout_secs <= 0 { 10 } else { timeout_secs as u32 };
                code = inject_into_process(info.hProcess, info.dwProcessId, &path, timeout * 1000);
            }
        }

        ResumeThread(info.hThread);
        CloseHandle(info.hThread);
        CloseHandle(info.hProcess);
        code
    }
}

/// 版本号（10000 = 1.0.0）
#[no_mangle]
pub extern "system" fn H3DLoaderVersion() -> i32 {
    10_000
}

/// 诊断信息（H3DLoader 扩展）：钩子回调进度 / 调用次数 / 最近一次加载错误
#[no_mangle]
pub extern "system" fn H3DLoaderDiagnostics(
    stage: *mut u32,
    calls: *mut u32,
    last_error: *mut u32,
) -> i32 {
    unsafe {
        let cfg = HOST_CFG.load(Ordering::SeqCst) as *const HookConfig;
        if cfg.is_null() {
            return 1;
        }
        if !stage.is_null() {
            *stage = (*cfg).stage;
        }
        if !calls.is_null() {
            *calls = (*cfg).hook_calls;
        }
        if !last_error.is_null() {
            *last_error = (*cfg).last_error;
        }
        codes::OK
    }
}

/// 名字（写入 `buf`，返回写入的宽字符数）
#[no_mangle]
pub extern "system" fn H3DLoaderName(buf: *mut u16, len: u32) -> i32 {
    if buf.is_null() || len == 0 {
        return 0;
    }
    let text: Vec<u16> = "H3DLoader 1.0.0".encode_utf16().collect();
    let n = text.len().min((len as usize).saturating_sub(1));
    unsafe {
        std::ptr::copy_nonoverlapping(text.as_ptr(), buf, n);
        *buf.add(n) = 0;
    }
    n as i32
}
