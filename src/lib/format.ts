import type { LogLevel } from "../types";

export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatTime(seconds: number | null): string {
  if (!seconds) {
    return "—";
  }
  return new Date(seconds * 1000).toLocaleString("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function toErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/** 深色控制台的日志配色（纯色值，内联使用） */
export const LOG_COLORS: Record<LogLevel, string> = {
  info: "#c7d1cc",
  ok: "#73d13d",
  warn: "#e0c377",
  error: "#ff7875",
};
