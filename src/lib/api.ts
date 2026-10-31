import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import type {
  AppInfo,
  DebugOption,
  DebugState,
  DumpFile,
  LaunchOutcome,
  LaunchSettings,
  LoaderUpdateInfo,
  ModItem,
  Status,
  UiSettings,
} from "../types";
import { isTauri, PREVIEW_NOTICE } from "./tauri-env";

/** 浏览器预览下直接给出可读提示，而不是裸的 invoke 报错 */
function guard<T>(task: () => Promise<T>): Promise<T> {
  if (!isTauri) {
    return Promise.reject(new Error(PREVIEW_NOTICE));
  }
  return task();
}

/**
 * Tauri v2 会自动把 Rust 侧的 snake_case 参数转成 camelCase，
 * 因此这里统一使用 camelCase 传参。
 */
export const api = {
  appInfo: () => guard(() => invoke<AppInfo>("app_info")),
  status: () => guard(() => invoke<Status>("get_status")),
  detectGame: () => guard(() => invoke<string | null>("detect_game")),
  pickGameFolder: (start: string) =>
    guard(() => invoke<string | null>("pick_game_folder", { start })),
  validateGameRoot: (gameRoot: string) =>
    guard(() => invoke<boolean>("validate_game_root", { gameRoot })),
  saveGamePath: (path: string) => guard(() => invoke<void>("save_game_path", { path })),
  install: (gameRoot: string) => guard(() => invoke<string[]>("install", { gameRoot })),
  uninstall: (gameRoot: string) => guard(() => invoke<string[]>("uninstall", { gameRoot })),
  /** 启动游戏（注入 3DMigoto，游戏退出后自动还原） */
  launchGame: (gameRoot: string) =>
    guard(() => invoke<LaunchOutcome>("launch_game", { gameRoot })),
  /** 取消注入，把游戏目录还原为原版 */
  restoreLoader: (gameRoot: string) =>
    guard(() => invoke<string[]>("restore_loader", { gameRoot })),
  getLaunchSettings: () =>
    guard(async () => {
      const [mode, timeout] = await invoke<[string, number]>("get_launch_settings");
      return normalizeLaunchSettings(mode, timeout);
    }),
  setLaunchSettings: (mode: string, timeout: number) =>
    guard(() => invoke<void>("set_launch_settings", { mode, timeout })),
  /** 注入方式：direct（远程线程）| hook（全局窗口钩子） */
  getInjectMode: () => guard(() => invoke<string>("get_inject_mode")),
  setInjectMode: (mode: string) => guard(() => invoke<void>("set_inject_mode", { mode })),
  /** 注入器信息（H3DLoader / 旧版 3dmloader） */
  getInjectorInfo: () =>
    guard(() =>
      invoke<{
        name: string;
        path: string;
        isOurs: boolean;
        supportsDirect: boolean;
        supportsHook: boolean;
        diagnostics: { stage: number; calls: number; lastError: number } | null;
      }>("get_injector_info"),
    ),
  openFolder: (path: string) => guard(() => invoke<void>("open_folder", { path })),
  openModsDir: (gameRoot: string) => guard(() => invoke<void>("open_mods_dir", { gameRoot })),
  openShaderFixesDir: (gameRoot: string) =>
    guard(() => invoke<void>("open_shaderfixes_dir", { gameRoot })),
  listMods: (gameRoot: string) => guard(() => invoke<ModItem[]>("list_mods", { gameRoot })),
  /** 在桌面创建「NSMMI 快速启动」快捷方式（双击即自动启动注入） */
  createDesktopShortcut: () => guard(() => invoke<string>("create_desktop_shortcut")),
  toggleMod: (gameRoot: string, name: string) =>
    guard(() => invoke<ModItem[]>("toggle_mod", { gameRoot, name })),
  openExternal: (url: string) =>
    isTauri ? openUrl(url) : Promise.reject(new Error(PREVIEW_NOTICE)),
  getWallpaper: () => guard(() => invoke<string | null>("get_wallpaper")),
  setWallpaper: (path: string | null) =>
    guard(() => invoke<void>("set_wallpaper", { path })),
  pickWallpaper: () => guard(() => invoke<string | null>("pick_wallpaper")),
  getUiSettings: () =>
    guard(async () => {
      const raw = await invoke<{ theme: string; font_size: number; auto_update: boolean }>(
        "get_ui_settings",
      );
      return normalizeUiSettings(raw.theme, raw.font_size, raw.auto_update);
    }),
  setUiSettings: (theme: string, fontSize: number, autoUpdate: boolean) =>
    guard(() => invoke<void>("set_ui_settings", { theme, fontSize, autoUpdate })),
  getDebugState: (gameRoot: string) =>
    guard(() => invoke<DebugState>("get_debug_state", { gameRoot })),
  setDebugOption: (gameRoot: string, option: DebugOption, enabled: boolean) =>
    guard(() => invoke<DebugState>("set_debug_option", { gameRoot, option, enabled })),
  /** 向游戏发送一次按键（没有小键盘时的替代方案） */
  sendGameKey: (key: string) => guard(() => invoke<string>("send_game_key", { key })),
  checkLoaderUpdate: () =>
    guard(() => invoke<LoaderUpdateInfo>("check_loader_update")),
  updateLoader: () => guard(() => invoke<string[]>("update_loader")),
  /** 壁纸标题栏区域是否为浅色（浅色 → 深色图标） */
  wallpaperTitlebarLight: () =>
    guard(() => invoke<boolean>("wallpaper_titlebar_light")),
  /** 显隐调试悬浮窗 */
  toggleOverlay: () => guard(() => invoke<boolean>("toggle_overlay")),
  /** 3DMigoto 日志尾部 */
  readLoaderLog: (gameRoot: string, lines?: number) =>
    guard(() =>
      invoke<string[]>("read_loader_log", { gameRoot, lines: lines ?? 40 }),
    ),
  /** ShaderFixes dump 列表（含备注） */
  listDumps: (gameRoot: string) =>
    guard(() => invoke<DumpFile[]>("list_dumps", { gameRoot })),
  /** 为 dump 添加备注并创建归档文件夹 */
  saveModelNote: (gameRoot: string, file: string, note: string) =>
    guard(() => invoke<DumpFile[]>("save_model_note", { gameRoot, file, note })),
};

function normalizeUiSettings(
  theme: string,
  fontSize: number,
  autoUpdate: boolean,
): UiSettings {
  return {
    theme: theme === "dark" || theme === "custom" ? theme : "light",
    fontSize: Math.min(18, Math.max(12, Math.round(fontSize) || 14)),
    autoUpdate: Boolean(autoUpdate),
  };
}

/** 启动方式与超时（非法值回退到默认） */
function normalizeLaunchSettings(mode: string, timeout: number): LaunchSettings {
  return {
    mode:
      mode === "launcher" || mode === "shell" || mode === "manual" ? mode : "direct",
    timeout: Math.min(300, Math.max(10, Math.round(timeout) || 30)),
  };
}

/** 把本地图片路径转成可在 WebView 中显示的 asset:// 地址 */
export function wallpaperSrc(path: string | null): string | null {
  if (!path || !isTauri) {
    return null;
  }
  return convertFileSrc(path);
}
