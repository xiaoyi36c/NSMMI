import type { GameKey } from "./types";

/** 项目主页，按需修改为你自己的仓库地址 */
export const REPO_URL = "https://github.com/xiaoyi36c/NSMMI";

/** 默认目标进程名，仅用于界面提示 */
export const DEFAULT_GAME_EXE = "nshm.exe";

/** 悬浮窗显隐广播事件（Rust 侧广播，主窗口据此同步开关状态） */
export const OVERLAY_VISIBILITY_EVENT = "nsmmi://overlay-visibility";

/**
 * 游戏内热键清单：渲染成可视化键帽，点击即向游戏发送一次按键。
 * 与 README「Mod 工作流」一致——小键盘 1/2/3 是猎取热键，
 * 部分笔记本没有小键盘，用这里的键帽代替手动按键。
 */
export const GAME_KEYS: GameKey[] = [
  {
    id: "hunting",
    key: "F8",
    cap: "F8",
    label: "狩猎高亮",
    desc: "周期性高亮着色模型",
    group: "常用",
  },
  {
    id: "reload",
    key: "F10",
    cap: "F10",
    label: "重载配置",
    desc: "重新加载 Mod 与着色器",
    group: "常用",
  },
  {
    id: "shader_prev",
    key: "Numpad1",
    cap: "小键盘1",
    label: "上一个着色器",
    desc: "浏览像素着色器，目标消失即命中",
    group: "猎取",
  },
  {
    id: "shader_next",
    key: "Numpad2",
    cap: "小键盘2",
    label: "下一个着色器",
    desc: "浏览像素着色器，目标消失即命中",
    group: "猎取",
  },
  {
    id: "dump_mark",
    key: "Numpad3",
    cap: "小键盘3",
    label: "导出标记",
    desc: "标记当前模型，hash 自动进剪贴板",
    group: "猎取",
  },
];
