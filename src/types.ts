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

export interface DebugState {
  /** [Hunting] hunting = 2 */
  hunting: boolean;
  /** [Logging] log = 2 */
  logging: boolean;
}

export type DebugOption = "hunting" | "logging";

export type BusyAction =
  | "detect"
  | "browse"
  | "install"
  | "uninstall"
  | "launch"
  | "toggle"
  | "wallpaper"
  | "debug"
  | null;

/** 侧边菜单对应的页面 */
export type View = "home" | "characters" | "debug" | "settings";

/** 界面主题：浅色 / 深色 / 自定义壁纸 */
export type UiTheme = "light" | "dark" | "custom";

export interface UiSettings {
  theme: UiTheme;
  fontSize: number;
}
