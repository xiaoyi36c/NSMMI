# XXMI 参考与迁移方案

> 参考工程：`XXMI-Launcher-2.4.9/`（项目根目录，Python / customtkinter）
> 本文只记录**对 NSMMI 有用**的部分与落地取舍，不含 XXMI 的完整架构说明。
> 逐条结论都标注了 XXMI 源码位置，便于核对。

## 0. 决策记录（2026-10-31）

| 决策 | 结论 |
| --- | --- |
| 加载器生效方式 | **否决「把 `d3d11.dll` 拷进游戏目录当代理」**，改为 `3dmloader.dll` 进程注入（Direct 模式） |
| 随包加载器来源 | 加载器仍是 **3DMigoto 1.4.9**（官方 d3d11 + d3dcompiler 46/47）；只借用 XXMI 的注入器组件 `3dmloader.dll`（20 KB）实现进程注入，不整体替换加载器 |
| 在线更新源 | 仍为 bo3b/3Dmigoto 的 Release；`3dmloader.dll` 随包提供，更新时不覆盖 |
| 游戏目录 | 保持原版，不再备份/还原游戏文件；旧版残留启动时自动清理（`inject::cleanup_legacy`） |
| 注入方式取舍 | **必须 Direct（`Inject`）**：3DMigoto 1.4.9 的 `d3d11.dll` 在 `DllMain` 里校验宿主可执行文件名，只有宿主是 `nshm.exe` 才初始化成功。Hook 模式要求先把 dll 加载进启动器进程（`NSMMI.exe`），`LoadLibrary` 必然失败 → `HookLibrary` 返回 200 + `ERROR_DLL_INIT_FAILED`（1114） |
| 验证状态 | `injector::inject` 冒烟测试通过（返回 100 = 未找到目标进程，说明 FFI 调用打通）；另以 `nshm.exe` 为名的测试进程验证 `Inject` 返回 0 且 `d3d11.dll` 出现在目标进程模块列表；`CREATE_SUSPENDED` 进程在恢复前注入同样成功 |

实现落点：`src-tauri/src/injector.rs`（FFI 封装）、`src-tauri/src/inject.rs`（注入流程状态）、
`src-tauri/src/install.rs`（启动编排：就绪检查 → 启动 → 等进程出现后注入）、`src-tauri/src/paths.rs`（加载器文件刷新）。

## 1. 架构分层对照

XXMI 分为五层，NSMMI 目前只有"命令层 + 少量领域模块"，没有配置分层与包管理层。

| 层 | XXMI | NSMMI 现状 |
| --- | --- | --- |
| 入口 | `app.py` → `core/application.py`（事件驱动编排） | `lib.rs`（Tauri builder + 直接注册命令） |
| 领域 | `game_launcher.py` / `package_manager.py` / `mod_manager.py` | `install.rs` / `loader.rs` / `mods.rs` / `inject.rs` |
| 工具 | `utils/dll_injector.py` / `utils/process_manager.py` / `utils/suspended_process.py` / `utils/ini_handler.py` | `spawn.rs`（挂起创建 + 参数透传）/ `keys.rs` / `launcher_ui.rs` |
| 配置 | `config_manager.py` + `config/`（分层 + 迁移 + 签名） | `config.rs`（单一 `AppConfig`，无版本迁移） |
| 状态 | `event_manager.py`（`Fire`/`Call`/`Subscribe`） | 前端 3s 轮询 `get_status` |

能力对照：

| 能力 | XXMI | NSMMI | 差距 / 结论 |
| --- | --- | --- | --- |
| 加载器生效 | `3dmloader.dll` 注入进程（Hook / Direct） | **已对齐**：`3dmloader.dll` Direct 注入 | 代理 dll 方案已否决；Hook 模式对 1.4.9 的 d3d11.dll 不可用，见 §0 |
| 启动来源校验 | 挂起官方启动器 + `PARENT_PROCESS` 伪装 | 已移植（`src-tauri/src/spawn.rs`） | 已完成 |
| 注入成功判定 | `WaitForInjection`（早期 5s + 后期 verify） | 枚举游戏进程模块是否加载 `d3d11.dll` | 够用，可补"窗口可见"判定 |
| Mods 管理 | 一级目录分组 + 整组启停 + ini 体检/修复 | 单个 `.ini` + `DISABLED_` 前缀 | 无体检、无分组 |
| d3dx.ini | 启动前按配置**动态重写** | 静态文件 + 只改 Hunting/Logging | 缺 target / 分辨率 / 延迟项 |
| 包更新 | manifest + sha256 + 签名 + 部署校验回滚 | GitHub release 拉 zip | 无完整性校验 |
| 状态同步 | 事件总线 | 轮询 | 延迟、空转 |

## 2. 六个可复用点（按价值排序）

### 2.1 Mods 体检器

XXMI 每次启动前扫描 `Mods` / `ShaderFixes` 下的 ini，识别四类问题：

1. **rogue `d3dx.ini`**：Mods 里混进带 `[Loader]` / `[System]` / `[Stereo]` 段或 `include_recursive=mods` 的 ini，会顶掉全局配置
2. **重复库**：ini 的 `namespace` 与加载器自带库同名 → 双重触发
3. **多余触发**：对已在别处触发的 slot 再做 `CheckTextureOverride`（EFMI 是 `ib`，WWMI 是 `ib`/`vb0`）
4. **全局 ShaderRegex 触发**：没有 `.pattern` 子段的 ShaderRegex 对全场生效，直接掉帧

判定逻辑见 `mod_manager.py:208-263`（`validate_ini_text`）与 `mod_manager.py:184-201`（ShaderRegex 全局触发）。
处置方式是"注释问题行 + 先备份"：

```python
# mod_manager.py:648-675（节选）
def sanitize_ini(self, mods_path, ini_path, line_issues, parsed_ini, dry_run=False):
    for issue in line_issues:
        line = parsed_ini.ini_lines[issue.line_id]
        if line.strip().startswith(';'):
            continue
        indent = line[:len(line) - len(line.lstrip())]
        fixed_line = ';' + line.strip()
        parsed_ini.ini_lines[issue.line_id] = indent + fixed_line
    if not dry_run:
        self.make_backup(ini_path)          # 备份为 *.xxmi_bak
        Paths.App.write_file(ini_path, '\n'.join(parsed_ini.ini_lines))
```

扫描结果按 ini 的 mtime 缓存，未改动文件直接跳过（`mod_manager.py:53-98`、`301-327`）。

**NSMMI 落地**：新增 `src-tauri/src/mods_doctor.rs`（`mods.rs` 旁），只保留与逆水寒相关的三类检查（rogue `d3dx.ini`、全局 ShaderRegex、`namespace` 重复；`ib`/`vb0` 是 GIMI/WWMI 专属，不适用）。

- 接口：`scan() -> Vec<ModsIssue { path, line, kind, reason }>`、`fix(&[ModsIssue]) -> Vec<String>`
- 修复：`.nsmmi_bak` 备份 → 行首加 `;`（保持缩进）
- UI：「角色管理」页顶部 `体检` 按钮 → 问题列表 → `一键修复`
- 验收：放一个含 `[Loader]` 的假 mod，能报出并一键注释，原文件有 `.nsmmi_bak`

### 2.2 d3dx.ini 动态维护

XXMI 不发布静态 ini，而是在启动前用 `IniHandler.set_option()` 按配置重写（保留注释与行序），只在内容变化时写盘：

```python
# model_importer.py:457-513（节选）
ini = IniHandler(IniHandlerSettings(ignore_comments=False), Paths.App.read_text(ini_path))
ini.set_option('Loader', 'target', game_exe_name)
self.set_default_ini_values(ini, 'enable_hunting', SettingType.Bool, Config.Active.Migoto.enable_hunting)
ini.set_option('System', 'dll_initialization_delay', ...)
ini.set_option('System', 'screen_width', screen_width)
ini.set_option('System', 'screen_height', screen_height)
ini.set_option('Logging', 'show_warnings', ...)
if ini.is_modified():
    Paths.App.write_file(ini_path, ini.to_string())
```

**NSMMI 现状**：`Resources/Loader/d3dx.ini` 是静态文件，`debug.rs` 只改 `[Hunting] hunting` 与 `[Logging]` 两个开关；缺 `[Loader] target`、`Logging` 明细、`System.dll_initialization_delay`、`screen_*`。

**落地**：新增 `src-tauri/src/ini.rs`（`Vec<Section{ name, lines }>`，改值不重排、不丢注释），启动前同步：

| 段 | 键 | 来源 |
| --- | --- | --- |
| `[Loader]` | `target = nshm.exe` | 常量（3DMigoto 靠它确认注入目标） |
| `[System]` | `dll_initialization_delay` | 设置项（默认 0，慢机可调） |
| `[System]` | `screen_width` / `screen_height` | 启动时读主屏分辨率 |
| `[Logging]` | `calls` / `debug` / `show_warnings` | 现有「详细日志」开关 |
| `[Include]` | `include_recursive = Mods`、`exclude_recursive = DISABLED*` | 配合体检器，禁用 mod 不遍历 |
| `[Hunting]` | `hunting` / `toggle_hunting` | 现有「狩猎模式」开关 |

验收：改「详细日志 / 狩猎」后启动游戏，ini 对应行变化且注释、顺序不变。

### 2.3 Mod 按目录分组启停

"`Mods\<一级目录>` 一个 mod，目录内所有 ini 一起启停；散落在 `Mods` 根目录的 ini 才是独立 mod"：

```python
# mod_manager.py:734-777（节选）
for p in ini_paths:
    if p.parent.name == "Mods":
        mods[p.stem] = Mod(name=p.stem, path=..., ini_paths=[p])
    else:
        grouped[p.parts[1]].append(p)
```

**NSMMI 现状**：`mods.rs::collect_mods` 把每个 `.ini` 当一条，装一个含 5 个 ini 的角色包要点 5 次。

**落地**：`ModInfo` 改两层（组 → 组内 ini），`toggle_mod` 对目录做前缀重命名；组内部分禁用显示"部分禁用"。
老数据可选自动整理（把散落 ini 收进同名文件夹），需在设置里给开关。

### 2.4 启动判定升级为"窗口可见"

XXMI：`wait_until_running(wait_for_window=True)`，除进程外还要求存在**可见顶层窗口**，避免"进程起来但崩在初始化"被当成成功（`process_manager.py:119-155`、`556-586`）。

**NSMMI 现状**：`install.rs::wait_for_game` 只查进程名。

**落地**：加一层 `EnumWindows` + `GetWindowThreadProcessId` + `IsWindowVisible`；超时后降级为"仅进程存在"，日志区分「已启动」/「进程已起但窗口未出现」。

### 2.5 `3dmloader.dll` 注入（游戏目录零文件）—— 已采纳

XXMI 不往游戏目录放 dll，用 `3dmloader.dll` 注入：

- **Hook 模式**：启动前 `HookLibrary(dll, "nshm")` 装全局钩子，游戏创建窗口时注入；注入后 `UnhookLibrary`
- **Direct 模式**：轮询进程 + `Inject(pid, dll, timeout)`（远程线程 + `WriteProcessMemory`）

```python
# dll_injector.py:89-98
if load_inject:
    self.lib.Inject.argtypes = (wt.DWORD, wt.LPCWSTR, ct.c_int)
    self.lib.Inject.restype = ct.c_int
```

`WaitForInjection` 提供权威的"注入成功"判定（`MigotoInjector.run/verify`，`migoto_package.py:387-459`），失败有完整错误码表（`InjectError`：100/200/300/400/500/600…，`dll_injector.py:196-207`），可直接映射成中文日志。

**风险**：远程线程注入比"同目录代理 dll"更容易被 NEAC 判定；需要把 `3dmloader.dll` 打进 `Resources` 并确认与 1.4.9 的 `d3dx.ini` 兼容。

**落地**：只用 **Direct**（`injector::inject`）。Hook 模式在本加载器上不可用——`3DMigoto 1.4.9` 的 `d3d11.dll` 在 `DllMain` 里校验宿主可执行文件名，加载进启动器进程（`NSMMI.exe`）必然返回 `ERROR_DLL_INIT_FAILED`（1114），`HookLibrary` 因此总是返回 200。Direct 注入发生在游戏进程内，校验能通过；直接启动时还能做到「挂起创建 → 注入 → 恢复」，赶在游戏创建 D3D11 设备之前挂好钩子。

### 2.6 状态改为事件推送

XXMI 用 `Fire` / `Call` / `Subscribe` 解耦核心与 GUI（`event_manager.py:26-90`）。
Tauri 等价物是 `app.emit`：注入成功、游戏退出、目录还原、加载器更新完成时 `emit("nsmmi://status", …)`，前端 `listen` 后只保留 30s 兜底轮询。
现有通道机制可直接复用（`src/hooks/useLauncher.ts` 里的 `listen(OVERLAY_VISIBILITY_EVENT)`）。

## 3. 明确不照搬

| 模块 | 原因 |
| --- | --- |
| `core/platforms/*`（Steam / Epic 库解析，约 2k 行） | 逆水寒是自研启动器 |
| 多 importer 抽象（GIMI/SRMI/WWMI/ZZMI/EFMI/HIMI 六套配置类） | 单游戏场景只会增加噪音 |
| `config/security.py`、dll 签名白名单 | 面向"防第三方篡改"，本地单人工具不需要 |
| `locale_manager.py` + 99 个 toml | 中文单语 |
| `gui/*`（customtkinter） | NSMMI 用 antd |

## 4. 落地顺序

| 阶段 | 内容 | 验收标准 |
| --- | --- | --- |
| P0-1 | `ini.rs` + 启动前动态维护 `d3dx.ini` | 改设置后重启，对应行变化且注释不丢 |
| P0-2 | Mods 体检（rogue `d3dx.ini` / 全局 ShaderRegex / namespace 重复）+ 备份+注释 | 假 mod 能被报出并一键修复 |
| P0-3 | 启动判定加"窗口可见" | 崩溃在初始化时日志显示"进程已起但窗口未出现" |
| P1-1 | Mod 目录分组启停 | 含 5 个 ini 的包一次点击整组停用 |
| P1-2 | 状态事件推送替代 3s 轮询 | 游戏退出后 ≤1s 界面回到"已就绪" |
| P0-0（已完成） | `3dmloader.dll` Direct 注入，游戏目录零文件 | 冒烟测试：`Inject` 调用打通；注入 `nshm.exe` 命名进程后 `d3d11.dll` 出现在其模块列表 |

## 5. 待定决策

1. **注入模式**：只保留代理 dll（游戏目录临时非原版），还是加一个实验性 `3dmloader` 注入（目录零文件、反作弊风险更高）？
2. **Mods 结构**：改成"目录=mod"后，历史数据是否自动整理？
3. **ini 归属**：`d3dx.ini` 改为每次启动前生成/修订（用户手改会被覆盖，XXMI 即如此），还是保留用户可长期自定义？

## 6. 源码索引

| 关注点 | 文件 |
| --- | --- |
| DLL 注入封装 | `core/utils/dll_injector.py` |
| 注入时序 / dll 身份识别 | `core/packages/migoto_package.py` |
| 进程启动 / 等窗口 / 优先级 | `core/utils/process_manager.py` |
| 父进程伪装（XXMI 做法，NSMMI 未采用：逆水寒实测只认命令行 `-ngp`） | `core/utils/suspended_process.py` |
| 启动编排 | `core/game_launcher.py` |
| Mods 体检 / 修复 / 分组 | `core/mod_manager.py` |
| d3dx.ini 动态维护 | `core/packages/model_importers/model_importer.py` |
| 配置分层与迁移 | `core/config_manager.py`、`core/config/enums.py` |
| 包更新 / 校验 / 部署 | `core/package_manager.py` |
| 事件总线 | `core/event_manager.py` |
