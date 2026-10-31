# NSMMI — 逆水寒 Model Importer

参考 [XXMI-Launcher](https://github.com/SpectrumQT/XXMI-Launcher) 的架构与注入方案设计的本地 mod 管理器，
加载器为 [3DMigoto 1.4.9](https://github.com/bo3b/3Dmigoto)（GPL，bo3b/DarkStarSword/Chiri），
由本项目自带的注入器 **H3DLoader**（`h3dloader/`，Rust）以**进程注入**方式加载，游戏目录不落任何文件。

> v1.1 起桌面端使用 **Tauri 2 + React 19 + TypeScript + Tailwind CSS 4** 重构，
> 旧版 PowerShell / WPF 实现保留在 [`legacy/`](legacy) 目录。

## 功能

- 游戏目录自动检测：上次记录 → 注册表卸载项（网易启动器）→ 各盘符常见路径扫描 → 手动浏览
- 一键准备：在 NSMMI 工作目录创建 `Mod\` / `ShaderFixes\`、刷新加载器文件 → 写入清单；**游戏目录不落任何文件**
- 进程注入：点「启动游戏」时由 **H3DLoader** 把 3DMigoto 注入游戏进程，游戏目录始终保持原版；
  不通过 NSMMI 启动（双击游戏）不会加载 3DMigoto
- 启动方式可选（借鉴 XXMI）：直接启动（跳过官方启动器，默认）/ 启动器（自动点「开始游戏」）/ Shell / 手动，并支持等待超时
- 注入方式可选：**Direct**（远程线程，可挂起创建抢在 D3D11 设备前）/ **Hook**（全局窗口钩子，不碰进程句柄）
- 一键卸载：按清单精确还原或删除，`Mod\` 中的用户文件永久保留
- Mod 管理：递归列出 mod，一键启用/停用（`DISABLED_` 前缀）
- 运行状态实时监测（游戏进程 / 已准备 / 已注入）

## 开发

### 环境要求

| 依赖 | 说明 |
| --- | --- |
| Node.js ≥ 20.19 | 前端构建（Vite 6） |
| Rust ≥ 1.77（msvc 工具链） | Tauri 后端，`rustup default stable-msvc` |
| Visual Studio 生成工具 2022 | 需勾选 "使用 C++ 的桌面开发"（MSVC + Windows SDK） |
| WebView2 Runtime | Win11 自带 |

### 常用命令

```powershell
npm install            # 安装前端依赖
npm run tauri dev      # 开发模式（热重载）
npm run tauri build    # 构建安装包（NSIS，输出在 src-tauri\target\release\bundle\）
npm run loader         # 重新编译 H3DLoader 并复制到 Resources\Loader\
npm run icons          # 重新生成应用图标（scripts/generate-icons.mjs）
npm run typecheck      # TypeScript 类型检查
```

## 包结构

```
NSMMI\
├── src\                      React 前端（UI 与交互）
├── src-tauri\                Tauri 2 后端（Rust：检测/安装/卸载/启动/Mod）
│   ├── src\                  commands / game / install / mods / config / paths
│   ├── tauri.conf.json       窗口与打包配置（Resources、Mod 随包分发）
│   └── icons\                应用图标（npm run icons 生成）
├── h3dloader\                H3DLoader 注入器（Rust cdylib，Direct + Hook 两种注入）
├── Resources\
│   ├── Loader\               3DMigoto 1.4.9（d3d11 + d3dcompiler_46/47）+ NSMMI 定制 d3dx.ini + h3dloader.dll（注入器）
│   └── ShaderFixes\          示例着色器
├── Mod\                      Mod 说明（首次准备时复制到工作目录）
├── scripts\                  图标生成等辅助脚本
├── legacy\                   旧版 PowerShell / WPF 实现（保留参考）
└── build\                    3DMigoto 构建产物（已 gitignore）
```

## 使用方法（打包后的 exe）

1. 点击 **[自动检测]** 定位游戏（也支持注册表 / 全盘常见路径扫描 / 手动浏览）
2. 点击 **[安装 / 更新]** —— 在工作目录准备 `Mod\` / `ShaderFixes\`、刷新加载器文件、写入清单。
   游戏目录**不会**出现任何文件（以前装过常驻/拷贝版本的，这一步会自动把它们撤出）
3. 点 **[启动游戏]**：装注入钩子 → 启动游戏 → 把 3DMigoto 注入游戏进程，**游戏目录始终保持原版**；
   双击游戏启动则不会加载 3DMigoto
   —— 裸启动会提示「请使用[逆水寒手游桌面版启动器]启动本游戏」，
   客户端只认命令行里的 `-ngp` 标记（官方启动器拉起游戏时会追加），
   默认的「直接启动」就是补上这个参数直接拉起 `nshm.exe`，未成功时自动回退到启动器
4. 「设置 → 启动」可选择启动方式、注入方式并设置超时：

   | 启动方式 | 说明 |
   | --- | --- |
   | 直接启动 | NSMMI 带 `-ngp` 直接拉起 `nshm.exe`，无需启动器进程（默认） |
   | 启动器 | NSMMI 拉起网易启动器并尝试自动点「开始游戏」 |
   | Shell | 通过系统命令拉起启动器，原生方式被拦截时改用 |
   | 手动 | 只装注入钩子，游戏由你启动，NSMMI 等待注入结果 |

   | 注入方式 | 说明 |
   | --- | --- |
   | Direct | 远程线程 `LoadLibraryW` 注入，能挂起创建抢在 D3D11 设备之前（默认） |
   | Hook | `SetWindowsHookExW` 全局窗口钩子注入，不开进程句柄，靠窗口消息送 dll |

5. **[卸载]** 清理清单与旧版残留，**Mod 中的用户文件永久保留**
6. **[取消注入]** 卸载注入钩子并清理旧版残留在游戏目录里的加载器（NSMMI 启动时也会自动清理）

## Mod 工作流

1. 游戏内猎取：小键盘 1/2 浏览像素着色器（目标模型消失即命中），3 标记导出（hash 自动进剪贴板）
2. 导出的反编译文件在 NSMMI 工作目录的 `ShaderFixes\`（`%APPDATA%\NSMMI\Loader\ShaderFixes`）
3. 修改后的 mod 以 `.ini` + 资源放进同一工作目录的 `Mod\`（自动递归加载，可在界面中一键启停）
4. **F10** 重载配置生效

## 游戏内按键（可视化键帽）

猎取热键绑定在**小键盘 1/2/3**，没有小键盘的笔记本无法手动按下。主窗口「调试模式」与调试悬浮窗
里的「游戏内按键」面板把这些热键做成可视化键帽，**点击键帽即向游戏发送对应按键**：

| 键帽 | 作用 |
| --- | --- |
| 「狩猎模式」开关 | 写入 `hunting = 1/0`（配合 F10 生效，平时零开销） |
| `F4` | 开关猎取模式（需先用 F10 启用过一次） |
| `F10` | 重载配置（重新加载 Mod 与着色器） |
| `小键盘1` | 上一个像素着色器（目标消失即命中） |
| `小键盘2` | 下一个像素着色器（目标消失即命中） |
| `小键盘3` | 标记导出（hash 自动进剪贴板） |
| `小键盘4/5/6` | 顶点着色器：上一个 / 下一个 / 标记 |
| `小键盘7/8/9` | 索引缓冲：上一个 / 下一个 / 标记 |
| `小键盘÷ × −` | 顶点缓冲：上一个 / 下一个 / 标记 |
| `小键盘0` | 切换标记模式（skip / pink 等） |

发送前会自动把游戏窗口切到前台，游戏未运行时键帽置灰。

## 卸载与回滚

- NSMMI 只在工作目录（`%APPDATA%\NSMMI\Loader`）保存加载器、`Mod\`、`ShaderFixes\`，以及 `游戏目录\_NSMMI\manifest.json` 清单
- 卸载会删除清单与旧版残留（`d3d11.dll / d3dcompiler_46.dll / d3dcompiler_47.dll / d3dx.ini / _NSMMI\`），**Mod 中的用户文件保留**
- 手动回滚到纯净状态：删除 `游戏目录\_NSMMI\` 即可（游戏目录本就不含加载器文件）

## 免责声明

- 本工具与网易、《逆水寒手游》官方无关，仅供本地学习研究
- **游戏含 NEAC 反作弊，使用存在账号处罚风险，请自行评估**，仅建议用于合规场景
- 请勿用于破坏游戏公平性的用途
