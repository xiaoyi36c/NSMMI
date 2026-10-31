import { memo } from "react";
import { Button, Card, Space, Switch, Typography } from "antd";
import {
  FolderOpenOutlined,
  FileImageOutlined,
  DatabaseOutlined,
  PushpinOutlined,
} from "@ant-design/icons";

import type { DebugOption, DebugState } from "../types";
import { GameKeyPanel } from "./GameKeyPanel";

interface DebugViewProps {
  debug: DebugState | null;
  busy: boolean;
  gameRunning: boolean;
  overlayVisible: boolean;
  onToggleDebug: (option: DebugOption) => void;
  onToggleOverlay: () => void;
  onOpenMod: () => void;
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

/** 调试模式：3DMigoto 调试开关 + 调试悬浮窗 + 目录直达（日志在独立「日志」页） */
export const DebugView = memo(function DebugView({
  debug,
  busy,
  gameRunning,
  overlayVisible,
  onToggleDebug,
  onToggleOverlay,
  onOpenMod,
  onOpenShaderFixes,
  onOpenGameDir,
}: DebugViewProps) {
  return (
    <div className="page-wrap page-col page-scroll">
      <Card id="debug-core" title="3DMigoto 调试" styles={{ body: { padding: "12px 16px" } }}>
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

      <Card id="debug-overlay" title="调试悬浮窗" styles={{ body: { padding: "12px 16px" } }}>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
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
                置顶半透明悬浮窗
              </Typography.Text>
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                悬浮在游戏画面旁（不注入游戏进程）：实时日志、狩猎/日志开关、模型备注归档。全局快捷键
                Ctrl+Shift+H 显隐。
              </Typography.Text>
            </div>
            <Switch checked={overlayVisible} onChange={onToggleOverlay} />
          </div>
        </Space>
      </Card>

      <Card id="debug-keys" styles={{ body: { padding: "12px 16px" } }}>
        <GameKeyPanel
          disabled={!gameRunning}
          hint={
            gameRunning
              ? "点击键帽向游戏发送按键（无小键盘也能用）"
              : "游戏未运行，键帽暂不可用"
          }
        />
      </Card>

      <Space wrap size={8} style={{ flexShrink: 0 }}>
        <Button icon={<PushpinOutlined aria-hidden="true" />} onClick={onToggleOverlay}>
          {overlayVisible ? "隐藏悬浮窗" : "打开悬浮窗"}
        </Button>
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
    </div>
  );
});
