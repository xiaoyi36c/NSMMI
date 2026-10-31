import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import type {
  AppInfo,
  DebugOption,
  DebugState,
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
  launchGame: (gameRoot: string) => guard(() => invoke<string[]>("launch_game", { gameRoot })),
  openFolder: (path: string) => guard(() => invoke<void>("open_folder", { path })),
  openModsDir: (gameRoot: string) => guard(() => invoke<void>("open_mods_dir", { gameRoot })),
  openShaderFixesDir: (gameRoot: string) =>
    guard(() => invoke<void>("open_shaderfixes_dir", { gameRoot })),
  listMods: (gameRoot: string) => guard(() => invoke<ModItem[]>("list_mods", { gameRoot })),
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
      const raw = await invoke<{ theme: string; font_size: number }>("get_ui_settings");
      return normalizeUiSettings(raw.theme, raw.font_size);
    }),
  setUiSettings: (theme: string, fontSize: number) =>
    guard(() => invoke<void>("set_ui_settings", { theme, fontSize })),
  getDebugState: (gameRoot: string) =>
    guard(() => invoke<DebugState>("get_debug_state", { gameRoot })),
  setDebugOption: (gameRoot: string, option: DebugOption, enabled: boolean) =>
    guard(() => invoke<DebugState>("set_debug_option", { gameRoot, option, enabled })),
};

function normalizeUiSettings(theme: string, fontSize: number): UiSettings {
  return {
    theme: theme === "dark" || theme === "custom" ? theme : "light",
    fontSize: Math.min(18, Math.max(12, Math.round(fontSize) || 14)),
  };
}

/** 把本地图片路径转成可在 WebView 中显示的 asset:// 地址 */
export function wallpaperSrc(path: string | null): string | null {
  if (!path || !isTauri) {
    return null;
  }
  return convertFileSrc(path);
}
