import type { ReactNode } from "react";
import {
  Alert,
  Button,
  Card,
  Segmented,
  Slider,
  Space,
  Switch,
  Typography,
} from "antd";
import { CloudDownloadOutlined, PictureOutlined } from "@ant-design/icons";

import type { BusyAction, LoaderUpdateInfo, UiTheme } from "../types";

interface SettingsViewProps {
  theme: UiTheme;
  fontSize: number;
  autoUpdate: boolean;
  loaderUpdate: LoaderUpdateInfo | null;
  wallpaper: string | null;
  busy: BusyAction;
  version: string | null;
  onThemeChange: (theme: UiTheme) => void;
  onFontSizeChange: (size: number) => void;
  onAutoUpdateChange: (enabled: boolean) => void;
  onCheckUpdate: () => void;
  onUpdateLoader: () => void;
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

/** 设置：游戏目录 + 加载器更新 + 主题 + 显示 + 关于 */
export function SettingsView({
  theme,
  fontSize,
  autoUpdate,
  loaderUpdate,
  wallpaper,
  busy,
  version,
  onThemeChange,
  onFontSizeChange,
  onAutoUpdateChange,
  onCheckUpdate,
  onUpdateLoader,
  onPickWallpaper,
  onClearWallpaper,
  children,
}: SettingsViewProps) {
  return (
    <div className="page-wrap page-scroll">
      {children}

      <Card title="加载器更新">
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <Typography.Text strong style={{ fontSize: 13 }}>
                3DMigoto 自动更新
              </Typography.Text>
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                启动时后台检查 bo3b/3Dmigoto 最新版本，发现新版自动下载
              </Typography.Text>
            </div>
            <Switch checked={autoUpdate} onChange={onAutoUpdateChange} />
          </div>

          <Space size={8} wrap>
            <Button
              icon={<CloudDownloadOutlined aria-hidden="true" />}
              onClick={onCheckUpdate}
              loading={busy === "update"}
            >
              检查更新
            </Button>
            {loaderUpdate?.hasUpdate && (
              <Button
                type="primary"
                onClick={onUpdateLoader}
                loading={busy === "update"}
              >
                更新到 {loaderUpdate.latest}
              </Button>
            )}
          </Space>

          {loaderUpdate?.hasUpdate ? (
            <Alert
              type="warning"
              showIcon
              message={`发现新版本 ${loaderUpdate.latest}（当前 ${loaderUpdate.current}）`}
              description={
                loaderUpdate.assetName ??
                "更新后需在「设置」中重新执行「安装 / 更新」部署到游戏目录。"
              }
            />
          ) : (
            loaderUpdate && (
              <Alert
                type="success"
                showIcon
                message={`已是最新版本 ${loaderUpdate.current}`}
              />
            )
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            更新只替换本地加载器缓存；部署到游戏目录仍需执行「安装 / 更新」。
          </Typography.Text>
        </Space>
      </Card>

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
