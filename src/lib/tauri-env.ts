/** 是否运行在 Tauri 桌面端（WebView 注入了 IPC） */
export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const PREVIEW_NOTICE = "浏览器预览模式：未检测到 Tauri 运行时，桌面功能不可用";
