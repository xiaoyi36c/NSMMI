import type { GameKey } from "./types";

/** 项目主页，按需修改为你自己的仓库地址 */
export const REPO_URL = "https://github.com/xiaoyi36c/NSMMI";

/** 默认目标进程名，仅用于界面提示 */
export const DEFAULT_GAME_EXE = "nshm.exe";

/** 悬浮窗显隐广播事件（Rust 侧广播，主窗口据此同步开关状态） */
export const OVERLAY_VISIBILITY_EVENT = "nsmmi://overlay-visibility";

/**
 * 游戏内热键清单：渲染成可视化键帽，点击即向游戏发送一次按键。
 * 与 Resources/Loader/d3dx.ini [Hunting] 的真实绑定一一对应：
 * F4 开关猎取、F10 重载配置、小键盘 0-9 与 ÷ × −（部分笔记本没有小键盘，
 * 用这里的键帽代替手动按键）。
 */
export const GAME_KEYS: GameKey[] = [
  {
    id: "hunting_toggle",
    key: "F4",
    cap: "F4",
    label: "开关猎取",
    desc: "开关猎取（需先开狩猎开关并按 F10 启用）",
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
    id: "ps_prev",
    key: "Numpad1",
    cap: "小键盘1",
    label: "上一个像素着色器",
    desc: "目标消失即命中",
    group: "像素着色器",
  },
  {
    id: "ps_next",
    key: "Numpad2",
    cap: "小键盘2",
    label: "下一个像素着色器",
    desc: "目标消失即命中",
    group: "像素着色器",
  },
  {
    id: "ps_mark",
    key: "Numpad3",
    cap: "小键盘3",
    label: "标记导出",
    desc: "反编译 HLSL 落盘，hash 自动进剪贴板",
    group: "像素着色器",
  },
  {
    id: "vs_prev",
    key: "Numpad4",
    cap: "小键盘4",
    label: "上一个顶点着色器",
    desc: "配合小键盘5/6 浏览与标记",
    group: "顶点着色器",
  },
  {
    id: "vs_next",
    key: "Numpad5",
    cap: "小键盘5",
    label: "下一个顶点着色器",
    desc: "配合小键盘4/6 浏览与标记",
    group: "顶点着色器",
  },
  {
    id: "vs_mark",
    key: "Numpad6",
    cap: "小键盘6",
    label: "标记顶点着色器",
    desc: "导出反编译结果到 ShaderFixes",
    group: "顶点着色器",
  },
  {
    id: "ib_prev",
    key: "Numpad7",
    cap: "小键盘7",
    label: "上一个索引缓冲",
    desc: "配合小键盘8/9 浏览与标记",
    group: "索引缓冲",
  },
  {
    id: "ib_next",
    key: "Numpad8",
    cap: "小键盘8",
    label: "下一个索引缓冲",
    desc: "配合小键盘7/9 浏览与标记",
    group: "索引缓冲",
  },
  {
    id: "ib_mark",
    key: "Numpad9",
    cap: "小键盘9",
    label: "标记索引缓冲",
    desc: "导出模型顶点数据（做模型 mod 用）",
    group: "索引缓冲",
  },
  {
    id: "vb_prev",
    key: "Divide",
    cap: "小键盘÷",
    label: "上一个顶点缓冲",
    desc: "配合小键盘× / − 浏览与标记",
    group: "顶点缓冲",
  },
  {
    id: "vb_next",
    key: "Multiply",
    cap: "小键盘×",
    label: "下一个顶点缓冲",
    desc: "配合小键盘÷ / − 浏览与标记",
    group: "顶点缓冲",
  },
  {
    id: "vb_mark",
    key: "Subtract",
    cap: "小键盘−",
    label: "标记顶点缓冲",
    desc: "导出模型顶点数据（做模型 mod 用）",
    group: "顶点缓冲",
  },
  {
    id: "marking_mode",
    key: "Numpad0",
    cap: "小键盘0",
    label: "切换标记模式",
    desc: "skip / pink / mono 等标记方式循环",
    group: "标记模式",
  },
];
