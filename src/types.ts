export interface AppInfo {
  version: string;
  gameExe: string;
  resourcesOk: boolean;
}

export interface Status {
  gamePath: string | null;
  installed: boolean;
  gameRunning: boolean;
  installedAt: number | null;
  nsmmiVersion: string | null;
}

export interface ModItem {
  /** 相对 Mods 目录的路径 */
  name: string;
  /** 文件绝对路径 */
  path: string;
  enabled: boolean;
  size: number;
}

export type LogLevel = "info" | "ok" | "warn" | "error";

export interface LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  text: string;
}

export type BusyAction =
  | "detect"
  | "browse"
  | "install"
  | "uninstall"
  | "launch"
  | "toggle"
  | "wallpaper"
  | null;

/** 侧边菜单对应的页面 */
export type View = "home" | "characters" | "debug" | "settings";
