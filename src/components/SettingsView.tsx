import type { ReactNode } from "react";
import { Button, Card, Segmented, Slider, Space, Typography } from "antd";
import { PictureOutlined } from "@ant-design/icons";

import type { BusyAction, UiTheme } from "../types";

interface SettingsViewProps {
  theme: UiTheme;
  fontSize: number;
  wallpaper: string | null;
  busy: BusyAction;
  version: string | null;
  onThemeChange: (theme: UiTheme) => void;
  onFontSizeChange: (size: number) => void;
  onPickWallpaper: () => void;
  onClearWallpaper: () => void;
  children: ReactNode;
}

const THEME_OPTIONS = [
  { label: "浅色", value: "light" },
  { label: "深色", value: "dark" },
  { label: "自定义", value: "custom" },
] as const;

const THEME_HINTS: Record<UiTheme, string> = {
  light: "标准浅色界面。",
  dark: "深色界面，夜间更护眼。",
  custom: "使用自定义背景图铺满整个窗口。",
};

const FONT_MARKS = { 12: "12", 14: "14", 16: "16", 18: "18" };

/** 设置：游戏目录 + 主题（浅色/深色/自定义）+ 显示（文字大小）+ 关于 */
export function SettingsView({
  theme,
  fontSize,
  wallpaper,
  busy,
  version,
  onThemeChange,
  onFontSizeChange,
  onPickWallpaper,
  onClearWallpaper,
  children,
}: SettingsViewProps) {
  return (
    <div className="page-wrap page-scroll">
      {children}

      <Card title="主题">
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Segmented
            options={THEME_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
            value={theme}
            onChange={(value) => onThemeChange(value as UiTheme)}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {THEME_HINTS[theme]}
          </Typography.Text>

          {theme === "custom" && (
            <Space size={8} wrap>
              <Button
                icon={<PictureOutlined aria-hidden="true" />}
                onClick={onPickWallpaper}
                disabled={busy !== null}
              >
                选择背景图
              </Button>
              {wallpaper !== null && (
                <Button onClick={onClearWallpaper} disabled={busy !== null}>
                  恢复默认
                </Button>
              )}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                支持 jpg / png / webp / bmp
              </Typography.Text>
            </Space>
          )}
        </Space>
      </Card>

      <Card title="显示">
        <Space direction="vertical" size={4} style={{ width: "100%" }}>
          <Typography.Text>文字大小：{fontSize}</Typography.Text>
          <Slider
            min={12}
            max={18}
            step={1}
            marks={FONT_MARKS}
            value={fontSize}
            onChange={onFontSizeChange}
            style={{ maxWidth: 360 }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            调整界面基准字号，立即生效并自动保存。
          </Typography.Text>
        </Space>
      </Card>

      <Card title="关于">
        <Space direction="vertical" size={4}>
          <Typography.Text>
            NSMMI {version ? `v${version}` : ""} · 3DMigoto 1.4.9（GPL）
          </Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
            仅供本地学习研究。游戏含 NEAC 反作弊，使用存在账号处罚风险，请自行评估。卸载时仅保留
            Mods\ 中的用户文件。
          </Typography.Paragraph>
        </Space>
      </Card>
    </div>
  );
}
