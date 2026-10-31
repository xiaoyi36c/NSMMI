import { memo, useMemo } from "react";
import { Button, Space } from "antd";
import {
  FolderOpenOutlined,
  FileImageOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";

import { filterLogs } from "../lib/logs";
import { LogConsole } from "./LogConsole";
import type { LogEntry, LogFilter } from "../types";

interface LogsViewProps {
  logs: LogEntry[];
  /** 中间栏级别筛选 */
  level: LogFilter;
  /** 侧栏搜索关键字（日志文本） */
  query: string;
  onClearLogs: () => void;
  onOpenMod: () => void;
  onOpenShaderFixes: () => void;
  onOpenGameDir: () => void;
}

/** 日志页：独立控制台 + 目录直达（级别 / 关键词筛选由中间栏下发） */
export const LogsView = memo(function LogsView({
  logs,
  level,
  query,
  onClearLogs,
  onOpenMod,
  onOpenShaderFixes,
  onOpenGameDir,
}: LogsViewProps) {
  // 与中间栏共用同一套筛选，两边结果永远一致
  const visible = useMemo(() => filterLogs(logs, level, query), [logs, level, query]);

  return (
    <div className="page-wrap page-col">
      <Space wrap size={8} style={{ flexShrink: 0 }}>
        <Button icon={<FolderOpenOutlined aria-hidden="true" />} onClick={onOpenMod}>
          打开 Mod 目录
        </Button>
        <Button icon={<FileImageOutlined aria-hidden="true" />} onClick={onOpenShaderFixes}>
          打开 ShaderFixes
        </Button>
        <Button icon={<DatabaseOutlined aria-hidden="true" />} onClick={onOpenGameDir}>
          打开游戏目录
        </Button>
      </Space>
      <LogConsole
        logs={visible}
        onClear={onClearLogs}
        emptyText={logs.length === 0 ? undefined : "没有匹配的日志"}
      />
    </div>
  );
});
