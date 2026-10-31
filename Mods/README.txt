NSMMI Mods 目录说明
====================

把 mod 的 .ini 文件（以及配套的 .dds / .hlsl / .txt 资源）放进本目录，
NSMMI 的 d3dx.ini 已启用 include_recursive = Mods，
子文件夹中的 mod 也会被自动递归加载，无需手动编辑任何配置。

命名约定（继承 3DMigoto 生态习惯）：
  - 每个 mod 一个子文件夹，例如 Mods\某某服装\
  - mod 内的 [TextureOverride]/[ShaderOverride] 段写在 .ini 中，hash 用猎取模式获取
  - 想临时停用某个 mod：把它的文件夹改名为 "DISABLED_xxx"（会被 exclude_recursive 忽略）

注意：
  - 卸载 NSMMI 时本目录会被保留，不会误删你的 mod。
  - 猎取操作流程：进游戏后用小键盘 1/2 浏览像素着色器（NumLock 需开启），
    模型消失即为目标，按 3 标记导出到 ShaderFixes\，编辑后 F10 重载生效。
