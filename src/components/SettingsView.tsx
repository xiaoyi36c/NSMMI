import type { ReactNode } from "react";
import { Card, Space, Typography, Button } from "antd";
import { PictureOutlined } from "@ant-design/icons";

import type { BusyAction } from "../types";

interface SettingsViewProps {
  wallpaper: string | null;
  busy: BusyAction;
  version: string | null;
  onPickWallpaper: () => void;
  onClearWallpaper: () => void;
  children: ReactNode;
}

/** 设置：游戏目录与安装操作 + 外观 + 关于 */
export function SettingsView({
  wallpaper,
  busy,
  version,
  onPickWallpaper,
  onClearWallpaper,
  children,
}: SettingsViewProps) {
  return (
    <div className="page-wrap page-scroll">
      {children}

      <Card title="外观">
        <Space direction="vertical" size={8}>
          <Space size={8} wrap>
            <Button
              icon={<PictureOutlined aria-hidden="true" />}
              onClick={onPickWallpaper}
              disabled={busy !== null}
            >
              设置首页背景图
            </Button>
            {wallpaper !== null && (
              <Button onClick={onClearWallpaper} disabled={busy !== null}>
                恢复默认
              </Button>
            )}
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            仅作用于首页，支持 jpg / png / webp / bmp。
          </Typography.Text>
        </Space>
      </Card>

      <Card title="关于">
        <Space direction="vertical" size={4}>
          <Typography.Text>
            NSMMI {version ? `v${version}` : ""} · 3DMigoto 1.4.9（GPL）
          </Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
            仅供本地学习研究。游戏含 NEAC 反作弊，使用存在账号处罚风险，请自行评估。卸载时保留
            ShaderFixes 与 Mods 中的用户文件。
          </Typography.Paragraph>
        </Space>
      </Card>
    </div>
  );
}
