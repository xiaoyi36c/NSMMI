import { memo } from "react";
import { Button, Card, Empty, List, Switch, Typography } from "antd";
import { FolderOpenOutlined, ReloadOutlined } from "@ant-design/icons";

import { formatSize } from "../lib/format";
import type { BusyAction, ModItem } from "../types";

interface ModListProps {
  mods: ModItem[];
  busy: BusyAction;
  onToggle: (name: string) => void;
  onRefresh: () => void;
  onOpenFolder: () => void;
}

/** Mod 列表卡片 */
export const ModList = memo(function ModList({
  mods,
  busy,
  onToggle,
  onRefresh,
  onOpenFolder,
}: ModListProps) {
  return (
    <Card
      title={`Mod (${mods.length})`}
      extra={
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined aria-hidden="true" />}
          onClick={onRefresh}
        >
          刷新
        </Button>
      }
      styles={{
        header: { padding: "0 16px", minHeight: 48 },
        body: {
          padding: 0,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        },
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        width: "100%",
        flex: 1,
      }}
    >
      <div
        className="scroll-paper"
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overscrollBehavior: "contain",
        }}
      >
        {mods.length === 0 ? (
          <div className="fill-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={null} />
            <p className="fill-empty-title">Mod 目录还是空的</p>
            <p className="fill-empty-hint">放入 .ini 与配套资源后会自动加载</p>
          </div>
        ) : (
          <List
            size="small"
            dataSource={mods}
            renderItem={(mod) => (
              <List.Item
                className="mod-item"
                style={{ padding: "10px 16px" }}
                actions={[
                  <Switch
                    key="switch"
                    size="small"
                    checked={mod.enabled}
                    disabled={busy !== null}
                    onChange={() => onToggle(mod.name)}
                    aria-label={`切换 ${mod.name}`}
                  />,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Typography.Text
                      code
                      delete={!mod.enabled}
                      style={{ fontSize: 12, userSelect: "text" }}
                      ellipsis
                    >
                      {mod.name}
                    </Typography.Text>
                  }
                  description={
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {formatSize(mod.size)}
                    </Typography.Text>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: "10px 16px 12px",
          borderTop: "1px solid rgba(5,5,5,0.06)",
        }}
      >
        <Button block icon={<FolderOpenOutlined aria-hidden="true" />} onClick={onOpenFolder}>
          打开 Mod 目录
        </Button>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 11 }}>
          停用 = 加 DISABLED_ 前缀，游戏内按 F10 重载配置。
        </Typography.Paragraph>
      </div>
    </Card>
  );
});
