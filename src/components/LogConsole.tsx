import { memo, useCallback, useEffect, useRef } from "react";
import { Button, Typography } from "antd";
import { ClearOutlined } from "@ant-design/icons";

import { LOG_COLORS } from "../lib/format";
import type { LogEntry } from "../types";

interface LogConsoleProps {
  logs: LogEntry[];
  onClear: () => void;
}

/** 距离底部小于该阈值视为“贴底”，贴底时才自动滚动 */
const BOTTOM_THRESHOLD = 24;

/** 日志行独立 memo：追加日志时只渲染新增行 */
const LogLine = memo(function LogLine({ entry }: { entry: LogEntry }) {
  return (
    <p className="log-line" style={{ color: LOG_COLORS[entry.level] }}>
      <span className="log-time">[{entry.time}]</span>
      {entry.text}
    </p>
  );
});

/** 深色控制台面板 */
export const LogConsole = memo(function LogConsole({
  logs,
  onClear,
}: LogConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    stickToBottom.current = distance < BOTTOM_THRESHOLD;
  }, []);

  // 滚动监听用被动监听，避免阻塞滚动
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.addEventListener("scroll", handleScroll, { passive: true });
    return () => node.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // 用户向上翻阅时不强制拉回底部
  useEffect(() => {
    const node = scrollRef.current;
    if (node && stickToBottom.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [logs.length]);

  return (
    <section className="log-console">
      <div className="log-console-head">
        <Typography.Text className="log-console-title" role="heading" aria-level={2}>
          控制台
        </Typography.Text>
        <Button
          type="text"
          size="small"
          icon={<ClearOutlined aria-hidden="true" />}
          onClick={onClear}
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          清空
        </Button>
      </div>
      <div
        ref={scrollRef}
        role="log"
        className="log-console-body scroll-dark"
      >
        {logs.length === 0 ? (
          <p className="log-line" style={{ color: "rgba(255,255,255,0.3)" }}>
            暂无日志
          </p>
        ) : (
          logs.map((entry) => <LogLine key={entry.id} entry={entry} />)
        )}
      </div>
    </section>
  );
});
