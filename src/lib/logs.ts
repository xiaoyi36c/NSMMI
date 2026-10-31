import type { LogEntry, LogFilter, LogLevel } from "../types";

/** 级别行顺序：错误 → 警告 → 成功 → 信息 */
export const LOG_LEVELS: { id: LogLevel; label: string }[] = [
  { id: "error", label: "错误" },
  { id: "warn", label: "警告" },
  { id: "ok", label: "成功" },
  { id: "info", label: "信息" },
];

/** 浅色面板上的级别色点（与深色控制台的 LOG_COLORS 区分开） */
export const LOG_DOT_COLORS: Record<LogLevel, string> = {
  error: "#ff4d4f",
  warn: "#faad14",
  ok: "#52c41a",
  info: "#8c8c8c",
};

/** 侧栏与控制台共用同一套筛选，保证两边看到的结果一致 */
export function filterLogs(logs: LogEntry[], level: LogFilter, query: string): LogEntry[] {
  const keyword = query.trim().toLowerCase();
  return logs.filter((entry) => {
    if (level !== "all" && entry.level !== level) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    return (
      entry.text.toLowerCase().includes(keyword) ||
      LOG_LEVELS.find((item) => item.id === entry.level)?.label.includes(keyword) === true
    );
  });
}
