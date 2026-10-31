export interface AppInfo {
  version: string;
  gameExe: string;
  resourcesOk: boolean;
}

export interface Status {
  gamePath: string | null;
  /** 已准备（原版备份完成，可随时按需注入） */
  installed: boolean;
  /** 加载器当前是否已注入游戏目录 */
  injected: boolean;
  /** 3DMigoto 是否已真正加载进游戏进程（注入成功） */
  modLoaded: boolean;
  /** 游戏目录里是否残留旧版常驻部署的加载器（需重新准备清理） */
  legacyResident: boolean;
  gameRunning: boolean;
  installedAt: number | null;
  nsmmiVersion: string | null;
  /** 当前生效的加载器版本 */
  loaderVersion: string;
}

/**
 * 启动方式（借鉴 XXMI：Native / Shell / Manual）
 *
 * - direct：NSMMI 直接启动游戏，补上启动器的 `-ngp` 标记参数以跳过启动校验
 * - launcher：经官方启动器自动拉起，并自动点击「开始游戏」
 * - shell：通过系统 shell 拉起启动器（原生方式异常时的备选）
 * - manual：只注入加载器，用户自己启动游戏
 */
export type LaunchMode = "direct" | "launcher" | "shell" | "manual";

export interface LaunchSettings {
  mode: LaunchMode;
  /** 等待游戏进程出现的超时（秒） */
  timeout: number;
}

/**
 * 注入方式（H3DLoader）
 *
 * - direct：远程线程注入。能挂起创建抢在 D3D11 设备创建之前，最稳
 * - hook：全局窗口钩子注入。不碰进程句柄，靠窗口消息把 dll 送进目标进程
 */
export type InjectMode = "direct" | "hook";

export interface ModItem {
  /** 相对 Mod 目录的路径 */
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
  /** [Hunting] hunting = 1 */
  hunting: boolean;
  /** [Logging] debug = 1 */
  logging: boolean;
}

export type DebugOption = "hunting" | "logging";

/** 启动游戏的结果 */
export interface LaunchOutcome {
  /** 过程日志 */
  lines: string[];
  /** 需要用户手动操作时的提示（例如在官方启动器里点「开始游戏」） */
  hint: string | null;
}

/** 游戏内热键（悬浮窗/主窗口的可视化键帽） */
export interface GameKey {
  /** 稳定标识 */
  id: string;
  /** 按键名（发送时使用，如 F4 / Numpad1 / Divide） */
  key: string;
  /** 键帽显示文本 */
  cap: string;
  /** 动作名称 */
  label: string;
  /** 动作说明 */
  desc: string;
  /** 分组名 */
  group: string;
}

export type BusyAction =
  | "detect"
  | "browse"
  | "install"
  | "uninstall"
  | "launch"
  | "restore"
  | "toggle"
  | "wallpaper"
  | "debug"
  | "update"
  | "note"
  | "shortcut"
  | null;

/** 侧边菜单对应的页面 */
export type View =
  | "home"
  | "characters"
  | "debug"
  | "dumps"
  | "logs"
  | "settings";

/** ShaderFixes 抓取的 dump 文件（模型 shader / 贴图） */
export interface DumpFile {
  name: string;
  size: number;
  modified: number | null;
  note: string | null;
}

/** 抓取文件的类型（按扩展名） */
export type DumpKind = "shader" | "texture" | "other";

/** 侧栏「资源抓取」筛选：全部 / 某一类 / 单个文件 */
export interface DumpFilter {
  kind: DumpKind | "all";
  /** 选中单个文件时锁定；null 表示只按类型筛选 */
  file: string | null;
}

/** 侧栏「日志」级别筛选 */
export type LogFilter = LogLevel | "all";

/** 界面主题：浅色 / 深色 / 自定义壁纸 */
export type UiTheme = "light" | "dark" | "custom";

export interface UiSettings {
  theme: UiTheme;
  fontSize: number;
  autoUpdate: boolean;
}

/** 3DMigoto 更新检测结果 */
export interface LoaderUpdateInfo {
  current: string;
  latest: string | null;
  hasUpdate: boolean;
  assetName: string | null;
  assetUrl: string | null;
}
