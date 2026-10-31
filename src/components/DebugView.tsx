import { memo } from "react";
import { Button, Space } from "antd";
import {
  FolderOpenOutlined,
  FileImageOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";

import { LogConsole } from "./LogConsole";
import type { LogEntry } from "../types";

interface DebugViewProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  onOpenMods: () => void;
  onOpenShaderFixes: () => void;
  onOpenGameDir: () => void;
}

/** 调试模式：运行日志与目录直达 */
export const DebugView = memo(function DebugView({
  logs,
  onClearLogs,
  onOpenMods,
  onOpenShaderFixes,
  onOpenGameDir,
}: DebugViewProps) {
  return (
    <div className="page-wrap page-col">
      <Space wrap size={8} style={{ flexShrink: 0 }}>
        <Button icon={<FolderOpenOutlined aria-hidden="true" />} onClick={onOpenMods}>
          打开 Mods 目录
        </Button>
        <Button icon={<FileImageOutlined aria-hidden="true" />} onClick={onOpenShaderFixes}>
          打开 ShaderFixes
        </Button>
        <Button icon={<DatabaseOutlined aria-hidden="true" />} onClick={onOpenGameDir}>
          打开游戏目录
        </Button>
      </Space>
      <LogConsole logs={logs} onClear={onClearLogs} />
    </div>
  );
});
