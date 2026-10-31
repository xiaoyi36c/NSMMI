import {
  BugOutlined,
  CameraOutlined,
  FileTextOutlined,
  HomeOutlined,
  TeamOutlined,
} from "@ant-design/icons";

import type { View } from "../types";

export interface NavEntry {
  key: View;
  label: string;
  icon: typeof HomeOutlined;
  /** 侧栏分组 */
  group: "game" | "tool";
}

/** 主导航（左侧图标栏与中间面板共用同一份定义） */
export const NAV_ENTRIES: NavEntry[] = [
  { key: "home", label: "首页", icon: HomeOutlined, group: "game" },
  { key: "characters", label: "角色管理", icon: TeamOutlined, group: "game" },
  { key: "dumps", label: "资源抓取", icon: CameraOutlined, group: "game" },
  { key: "debug", label: "调试模式", icon: BugOutlined, group: "tool" },
  { key: "logs", label: "日志", icon: FileTextOutlined, group: "tool" },
];

export const NAV_GROUPS: { id: NavEntry["group"]; label: string }[] = [
  { id: "game", label: "游戏" },
  { id: "tool", label: "工具箱" },
];
