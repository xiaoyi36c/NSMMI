import { memo, useMemo } from "react";
import { FileTextOutlined, InboxOutlined } from "@ant-design/icons";

import { LOG_DOT_COLORS, LOG_LEVELS, filterLogs } from "../../lib/logs";
import type { LogEntry, LogFilter } from "../../types";

interface LogsPanelProps {
  logs: LogEntry[];
  /** 侧栏搜索关键字（匹配日志文本） */
  query: string;
  level: LogFilter;
  onLevelChange: (level: LogFilter) => void;
}

/** 日志页的中间栏：全部 → 按级别筛选（计数随关键字实时变化） */
export const LogsPanel = memo(function LogsPanel({
  logs,
  query,
  level,
  onLevelChange,
}: LogsPanelProps) {
  const matched = useMemo(
    () => filterLogs(logs, "all", query),
    [logs, query],
  );

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of matched) {
      map[entry.level] = (map[entry.level] ?? 0) + 1;
    }
    return map;
  }, [matched]);

  return (
    <>
      <button
        type="button"
        className={`panel-item${level === "all" ? " active" : ""}`}
        onClick={() => onLevelChange("all")}
        aria-current={level === "all" ? "page" : undefined}
      >
        <FileTextOutlined className="panel-item-icon" aria-hidden="true" />
        <span className="panel-item-label">全部日志</span>
        {matched.length > 0 && <span className="panel-item-count">{matched.length}</span>}
      </button>

      {logs.length === 0 ? (
        <div className="panel-empty">
          <InboxOutlined className="panel-empty-icon" aria-hidden="true" />
          <p className="panel-empty-title">还没有日志</p>
          <p className="panel-empty-hint">启动游戏或执行操作后，这里会出现记录</p>
        </div>
      ) : matched.length === 0 ? (
        <div className="panel-empty">
          <InboxOutlined className="panel-empty-icon" aria-hidden="true" />
          <p className="panel-empty-title">没有匹配的日志</p>
          <p className="panel-empty-hint">换个关键词试试</p>
        </div>
      ) : (
        <div className="panel-group">
          {LOG_LEVELS.map(({ id, label }) => {
            const count = counts[id] ?? 0;
            if (count === 0) {
              return null;
            }
            const active = level === id;
            return (
              <button
                key={id}
                type="button"
                className={`panel-item panel-item-leaf${active ? " active" : ""}`}
                onClick={() => onLevelChange(active ? "all" : id)}
                aria-current={active ? "page" : undefined}
              >
                <span
                  className="panel-level-dot"
                  style={{ background: LOG_DOT_COLORS[id] }}
                  aria-hidden="true"
                />
                <span className="panel-item-label">{label}</span>
                <span className="panel-item-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
});
