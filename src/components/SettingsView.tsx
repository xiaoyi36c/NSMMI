import type { ReactNode } from "react";
import {
  Alert,
  Button,
  Card,
  InputNumber,
  Segmented,
  Slider,
  Space,
  Switch,
  Typography,
} from "antd";
import { CloudDownloadOutlined, PictureOutlined } from "@ant-design/icons";

import type {
  BusyAction,
  InjectMode,
  LaunchMode,
  LaunchSettings,
  LoaderUpdateInfo,
  UiTheme,
} from "../types";

interface SettingsViewProps {
  theme: UiTheme;
  fontSize: number;
  autoUpdate: boolean;
  launchMode: LaunchMode;
  launchTimeout: number;
  injectMode: InjectMode;
  loaderUpdate: LoaderUpdateInfo | null;
  wallpaper: string | null;
  busy: BusyAction;
  version: string | null;
  onThemeChange: (theme: UiTheme) => void;
  onFontSizeChange: (size: number) => void;
  onAutoUpdateChange: (enabled: boolean) => void;
  onLaunchSettingsChange: (next: LaunchSettings) => void;
  onInjectModeChange: (mode: InjectMode) => void;
  onCheckUpdate: () => void;
  onUpdateLoader: () => void;
  onPickWallpaper: () => void;
  onClearWallpaper: () => void;
  children: ReactNode;
}

const LAUNCH_MODE_OPTIONS: { label: string; value: LaunchMode }[] = [
  { label: "直接启动", value: "direct" },
  { label: "启动器", value: "launcher" },
  { label: "Shell", value: "shell" },
  { label: "手动", value: "manual" },
];

const LAUNCH_MODE_HINTS: Record<LaunchMode, string> = {
  direct:
    "直接启动：NSMMI 带 -ngp 参数直接拉起 nshm.exe，跳过「请使用桌面版启动器启动」校验；没起来会自动回退到「启动器」。",
  launcher:
    "启动器：NSMMI 拉起网易启动器并尝试自动点「开始游戏」，启动较慢但完全走官方链路。",
  shell:
    "Shell：通过系统命令拉起启动器。若「启动器」方式被安全软件拦截或异常，可改用它。",
  manual:
    "手动：只注入加载器，游戏由你自己启动；NSMMI 只负责在超时内等待，并在游戏退出后自动还原。",
};

const INJECT_MODE_OPTIONS: { label: string; value: InjectMode }[] = [
  { label: "Direct", value: "direct" },
  { label: "Hook", value: "hook" },
];

const INJECT_MODE_HINTS: Record<InjectMode, string> = {
  direct:
    "Direct：H3DLoader 用远程线程注入 d3d11.dll。能挂起创建游戏进程，抢在 D3D11 设备创建之前挂好钩子，最稳（默认）。",
  hook: "Hook：H3DLoader 装一个全局窗口钩子，靠窗口消息把 d3d11.dll 送进游戏进程，不打开进程句柄；个别游戏/安全软件下可绕开对远程线程的拦截。",
};

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
  launchMode,
  launchTimeout,
  injectMode,
  loaderUpdate,
  wallpaper,
  busy,
  version,
  onThemeChange,
  onFontSizeChange,
  onAutoUpdateChange,
  onLaunchSettingsChange,
  onInjectModeChange,
  onCheckUpdate,
  onUpdateLoader,
  onPickWallpaper,
  onClearWallpaper,
  children,
}: SettingsViewProps) {
  return (
    <div className="page-wrap page-scroll">
      <div id="settings-game">{children}</div>

      <Card id="settings-launch" title="启动">
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Space size={12} wrap>
            <Space size={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>
                启动方式
              </Typography.Text>
              <Segmented
                value={launchMode}
                options={LAUNCH_MODE_OPTIONS}
                onChange={(value) =>
                  onLaunchSettingsChange({
                    mode: value as LaunchMode,
                    timeout: launchTimeout,
                  })
                }
              />
            </Space>
            <Space size={8}>
              <Typography.Text strong style={{ fontSize: 13 }}>
                超时
              </Typography.Text>
              <InputNumber
                min={10}
                max={300}
                step={5}
                value={launchTimeout}
                addonAfter="秒"
                style={{ width: 130 }}
                onChange={(value) =>
                  onLaunchSettingsChange({
                    mode: launchMode,
                    timeout: Number(value) || 30,
                  })
                }
              />
            </Space>
          </Space>

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {LAUNCH_MODE_HINTS[launchMode]}
          </Typography.Text>

          <Space size={8}>
            <Typography.Text strong style={{ fontSize: 13 }}>
              注入方式
            </Typography.Text>
            <Segmented
              value={injectMode}
              options={INJECT_MODE_OPTIONS}
              onChange={(value) => onInjectModeChange(value as InjectMode)}
            />
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {INJECT_MODE_HINTS[injectMode]}
          </Typography.Text>

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            加载器「进程注入」：点「启动游戏」时由 H3DLoader 把 3DMigoto 注入游戏进程，
            游戏目录始终保持原版；不通过 NSMMI 启动则不会加载。
          </Typography.Text>
        </Space>
      </Card>

      <Card id="settings-update" title="加载器更新">
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
                "更新后会替换本地加载器缓存，点一次「安装 / 更新」即可生效。"
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
            更新只替换本地加载器缓存；刷新到工作目录仍需执行「安装 / 更新」。
          </Typography.Text>
        </Space>
      </Card>

      <Card id="settings-theme" title="主题">
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

      <Card id="settings-display" title="显示">
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


      <Card id="settings-about" title="关于">
        <Space direction="vertical" size={4}>
          <Typography.Text>
            NSMMI {version ? `v${version}` : ""} · 3DMigoto（GPL）
          </Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
            仅供本地学习研究。游戏含 NEAC 反作弊，使用存在账号处罚风险，请自行评估。卸载时仅保留
            Mod\ 中的用户文件。
          </Typography.Paragraph>
        </Space>
      </Card>
    </div>
  );
}
