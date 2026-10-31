# NSMMI — 逆水寒 Model Importer

参考 [XXMI-Launcher](https://github.com/SpectrumQT/XXMI-Launcher) 架构设计的本地 mod 管理器，
加载器基于 [3DMigoto 1.4.9](https://github.com/bo3b/3Dmigoto)（GPL，bo3b/DarkStarSword/Chiri）。

> v1.1 起桌面端使用 **Tauri 2 + React 19 + TypeScript + Tailwind CSS 4** 重构，
> 旧版 PowerShell / WPF 实现保留在 [`legacy/`](legacy) 目录。

## 功能

- 游戏目录自动检测：上次记录 → 注册表卸载项（网易启动器）→ 各盘符常见路径扫描 → 手动浏览
- 一键安装：自动备份原文件 → 部署加载器 → 创建 Mods 目录 → 写入安装清单
- 一键启动 / 卸载：卸载按清单精确还原或删除，`ShaderFixes\` 与 `Mods\` 中的用户文件永久保留
- Mods 管理：递归列出 mod，一键启用/停用（`DISABLED_` 前缀）
- 运行状态实时监测（游戏进程 / 安装状态）

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
npm run icons          # 重新生成应用图标（scripts/generate-icons.mjs）
npm run typecheck      # TypeScript 类型检查
```

## 包结构

```
NSMMI\
├── src\                      React 前端（UI 与交互）
├── src-tauri\                Tauri 2 后端（Rust：检测/安装/卸载/启动/Mods）
│   ├── src\                  commands / game / install / mods / config / paths
│   ├── tauri.conf.json       窗口与打包配置（Resources、Mods 随包分发）
│   └── icons\                应用图标（npm run icons 生成）
├── Resources\
│   ├── Loader\               3DMigoto 1.4.9 x64 + NSMMI 定制 d3dx.ini
│   └── ShaderFixes\          示例着色器
├── Mods\                     Mods 说明（随安装部署到游戏目录）
├── scripts\                  图标生成等辅助脚本
├── legacy\                   旧版 PowerShell / WPF 实现（保留参考）
└── build\                    3DMigoto 构建产物（已 gitignore）
```

## 使用方法（打包后的 exe）

1. 点击 **[自动检测]** 定位游戏（也支持注册表 / 全盘常见路径扫描 / 手动浏览）
2. 点击 **[安装 / 更新]** —— 自动备份原文件、部署加载器、创建 Mods 目录、写入安装清单
3. 点击 **[启动游戏]** 启动
4. **[卸载]** 按安装清单精确还原/删除加载器文件，**ShaderFixes 与 Mods 中的用户文件永久保留**

## Mods 工作流

1. 游戏内猎取：小键盘 1/2 浏览像素着色器（目标模型消失即命中），3 标记导出（hash 自动进剪贴板）
2. 导出的反编译文件在 `游戏目录\ShaderFixes\`
3. 修改后的 mod 以 `.ini` + 资源放进 `游戏目录\Mods\`（自动递归加载，可在界面中一键启停）
4. **F10** 重载配置生效

## 卸载与回滚

- NSMMI 安装内容：`d3d11.dll / d3dcompiler_46.dll / d3dcompiler_47.dll / d3dx.ini` + 目录结构
- 原文件备份在 `游戏目录\_NSMMI\backup\`，卸载时自动还原；无备份的文件直接删除
- 手动回滚到纯净状态：删除上述四个文件 + `_NSMMI\` 目录即可

## 免责声明

- 本工具与网易、《逆水寒手游》官方无关，仅供本地学习研究
- **游戏含 NEAC 反作弊，使用存在账号处罚风险，请自行评估**，仅建议用于合规场景
- 请勿用于破坏游戏公平性的用途
