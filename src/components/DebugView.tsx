import { memo } from "react";
import { Button, Card, Space, Switch, Typography } from "antd";
import {
  FolderOpenOutlined,
  FileImageOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";

import { LogConsole } from "./LogConsole";
import type { DebugOption, DebugState, LogEntry } from "../types";

interface DebugViewProps {
  debug: DebugState | null;
  busy: boolean;
  onToggleDebug: (option: DebugOption) => void;
  logs: LogEntry[];
  onClearLogs: () => void;
  onOpenMods: () => void;
  onOpenShaderFixes: () => void;
  onOpenGameDir: () => void;
}

function SwitchRow({
  checked,
  disabled,
  onChange,
  title,
  desc,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  title: string;
  desc: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div>
        <Typography.Text strong style={{ fontSize: 13 }}>
          {title}
        </Typography.Text>
        <br />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {desc}
        </Typography.Text>
      </div>
      <Switch checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

/** 调试模式：3DMigoto（d3dx.ini）调试开关 + 运行日志 + 目录直达 */
export const DebugView = memo(function DebugView({
  debug,
  busy,
  onToggleDebug,
  logs,
  onClearLogs,
  onOpenMods,
  onOpenShaderFixes,
  onOpenGameDir,
}: DebugViewProps) {
  return (
    <div className="page-wrap page-col">
      <Card
        title="3DMigoto 调试"
        styles={{ body: { padding: "12px 16px" } }}
      >
        {debug === null ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            未选择游戏目录或尚未安装加载器（缺少 d3dx.ini），安装后即可控制调试开关。
          </Typography.Text>
        ) : (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <SwitchRow
              checked={debug.hunting}
              disabled={busy}
              onChange={() => onToggleDebug("hunting")}
              title="狩猎模式（hunting = 2）"
              desc="游戏内按 F8 周期性高亮着色模型，用于定位 mod 目标；重启游戏后生效。"
            />
            <SwitchRow
              checked={debug.logging}
              disabled={busy}
              onChange={() => onToggleDebug("logging")}
              title="详细日志（log = 2）"
              desc="输出 3DMigoto 警告与错误日志，便于排查 shader/mod 问题；重启游戏后生效。"
            />
          </Space>
        )}
      </Card>

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
