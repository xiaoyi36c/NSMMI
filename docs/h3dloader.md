# H3DLoader — NSMMI 自带注入器

`h3dloader/`（Rust `cdylib`，静态 CRT）编译产物 `h3dloader.dll`，随 `Resources\Loader\` 分发。
导出 ABI 与旧的 `3dmloader.dll` 兼容，NSMMI 可以无缝切换。

## 两种注入方式

| 方式 | 实现 | 适用场景 |
| --- | --- | --- |
| **Direct** | `OpenProcess` → `VirtualAllocEx` → `WriteProcessMemory` → `CreateRemoteThreadEx(LoadLibraryW)` | 知道 pid；直接启动时挂起创建进程，抢在 D3D11 设备创建之前注入（默认、最稳） |
| **Hook** | `SetWindowsHookExW(WH_CBT)` 把本 dll 映射进目标进程，钩子回调里再 `LoadLibrary` 载荷 | 不打开进程句柄；可配合「手动 / 启动器」启动，目标进程处理窗口消息时自动加载 |

Direct 的 kernel32 基址优先用 Toolhelp 快照取目标进程的真实值；挂起创建（模块表还没初始化）取不到时，
退回本进程基址 —— x64 + Win8 起系统 dll 在所有进程里基址一致。

## 导出（与 3dmloader 一致的部分）

| 导出 | 签名 | 说明 |
| --- | --- | --- |
| `Inject` | `int Inject(uint32 pid, const wchar_t* dll, int timeout_secs)` | Direct 注入，0 = 成功 |
| `HookLibrary` | `int HookLibrary(const wchar_t* dll, HHOOK* hook, HANDLE* mutex)` | 安装全局钩子，0 = 成功 |
| `WaitForInjection` | `int WaitForInjection(const wchar_t* dll, const wchar_t* exe, int timeout_secs)` | 等钩子把 dll 送进目标进程，0 = 成功 |
| `UnhookLibrary` | `int UnhookLibrary(HHOOK* hook, HANDLE* mutex)` | 卸载钩子 |
| `StartProcess` | `int StartProcess(const wchar_t* cmdline, const wchar_t* dll, int timeout_secs)` | 拉起进程 → 挂起注入 → 恢复（`dll` 为空则只启动） |

## 扩展导出

| 导出 | 说明 |
| --- | --- |
| `SetHookTarget(const wchar_t* exe)` | 提前指定 Hook 的目标进程名（否则钩子回调时还拿不到目标） |
| `H3DLoaderDiagnostics(uint32* stage, uint32* calls, uint32* lastError)` | 诊断：钩子回调阶段 / 次数 / 最近错误 |
| `H3DLoaderVersion()` | 10000 = 1.0.0 |
| `H3DLoaderName(wchar_t* buf, uint32 len)` | 名称字符串 |

## Hook 模式的跨进程参数

命名共享内存 `Local\H3DLoaderCfg`：

```c
struct HookConfig {
    uint32 magic;            // 'H3DL'
    uint32 version;
    wchar_t target_exe[128]; // 目标 exe 名（小写）
    wchar_t dll_path[520];   // 待加载 dll 绝对路径
    uint32 loaded_pid;       // 成功加载载荷的 pid（0 = 未加载）
    uint32 last_error;       // 最近一次加载失败的系统错误码
    uint32 stage;            // 0 未触发 / 1 已进回调 / 2 进程名不匹配 / 3 命中 / 4 已加载 / 5 加载失败
    uint32 hook_calls;       // 回调次数
};
```

钩子回调里：读配置 → 比对当前进程 exe 名 → 命中则在**独立线程**里 `LoadLibraryExW`
（回调可能正在 loader lock 内，直接加载有死锁风险），加载结果写回 `loaded_pid` / `last_error`。
钩子 dll 用 `GET_MODULE_HANDLE_EX_FLAG_PIN` 固定，避免卸载后线程还在跑。

## 返回码

| 码 | Direct | Hook |
| --- | --- | --- |
| 100 | 未找到目标进程 | 已有实例在运行 |
| 110 | dll 路径无效 | — |
| 120 | 定位 kernel32 失败 | — |
| 130 | 定位 LoadLibraryW 失败 | — |
| 200 | 远程分配内存失败 | dll 不存在/不可读 |
| 300 | 写路径失败 | 缺少 dll 参数 |
| 400 | 创建远程线程失败（反作弊拦截常见） | 安装钩子失败 |
| 500 / 510 | 线程超时 / 等待失败 | — |
| 600 | 目标进程加载 dll 失败（DllMain 返回 FALSE） | — |

## 为什么 Hook 模式能过 3DMigoto 的宿主校验

3DMigoto 1.4.9 的 `d3d11.dll` 在 `DllMain` 里校验宿主可执行文件名，只有宿主是 `nshm.exe` 时才初始化。
旧的 `3dmloader` Hook 模式会把 dll 也载入注入器自身进程（宿主是 NSMMI.exe），必然 `ERROR_DLL_INIT_FAILED`；
H3DLoader 只在**目标进程**里加载载荷，因此能过校验。

## 构建

```powershell
npm run loader         # cargo build --release --manifest-path h3dloader/Cargo.toml + 复制到 Resources\Loader\
```

## 实测记录（2026-10-31）

| 场景 | 结果 |
| --- | --- |
| Direct → `charmap.exe` | 返回 0，目标进程出现待注入 dll |
| Hook → `charmap.exe` | 返回 0，`stage=4`，回调 1 次，dll 已加载 |
| Direct → `nshm.exe`（挂起创建后注入 `d3d11.dll`） | 返回 0，游戏模块里 `d3d11.dll` 来自 `%APPDATA%\NSMMI\Loader`（先于系统 d3d11 加载） |
| Hook → `nshm.exe`（`-ngp` 正常启动） | 返回 0，游戏内同时存在 H3DLoader 与注入的 `d3d11.dll` |
