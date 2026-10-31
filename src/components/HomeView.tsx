import { Button, Space, Typography } from "antd";
import { PictureOutlined, PlayCircleOutlined } from "@ant-design/icons";

import { wallpaperSrc } from "../lib/api";
import type { BusyAction, Status } from "../types";

interface HomeViewProps {
  wallpaper: string | null;
  status: Status;
  busy: BusyAction;
  version: string | null;
  onLaunch: () => void;
  onInstall: () => void;
  onPickWallpaper: () => void;
  onClearWallpaper: () => void;
}

/** 主页：全幅背景（可选自定义壁纸）+ 大启动按钮 */
export function HomeView({
  wallpaper,
  status,
  busy,
  version,
  onLaunch,
  onInstall,
  onPickWallpaper,
  onClearWallpaper,
}: HomeViewProps) {
  const src = wallpaperSrc(wallpaper);
  const locked = busy !== null;
  const onImage = src !== null;

  const textColor = onImage ? "#fff" : undefined;
  const subColor = onImage ? "rgba(255,255,255,0.8)" : undefined;

  return (
    <div className="home-view">
      {src ? (
        <img src={src} alt="" className="home-wallpaper" />
      ) : (
        <div aria-hidden="true" className="home-default-bg" />
      )}

      {onImage && <div aria-hidden="true" className="home-scrim" />}

      <div className="home-content">
        <div style={{ maxWidth: 480 }}>
          <Typography.Title level={3} style={{ color: textColor, marginTop: 0 }}>
            {status.installed ? "已就绪，随时启动游戏" : "尚未安装加载器"}
          </Typography.Title>
          <Typography.Paragraph style={{ color: subColor }}>
            {status.installed
              ? "mod 放入游戏目录的 Mods\\ 即自动加载，按 F10 重载配置。"
              : "在「管理」中定位游戏目录并安装，随后即可启动。"}
          </Typography.Paragraph>
        </div>

        <div className="home-bottom">
          <div>
            <Space size={12} wrap>
              <Typography.Text style={{ color: subColor, fontSize: 12, fontFamily: "Consolas, monospace" }}>
                NSMMI {version ?? ""} · 3DMigoto 1.4.9
              </Typography.Text>
            </Space>
            <div style={{ marginTop: 8 }}>
              <Space size={4}>
                <Button
                  type="text"
                  size="small"
                  icon={<PictureOutlined aria-hidden="true" />}
                  onClick={onPickWallpaper}
                  disabled={locked}
                  style={{ color: subColor }}
                >
                  设置背景图
                </Button>
                {onImage && (
                  <Button
                    type="text"
                    size="small"
                    onClick={onClearWallpaper}
                    disabled={locked}
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    恢复默认
                  </Button>
                )}
              </Space>
            </div>
          </div>

          <Space size={12}>
            <Button
              ghost={onImage}
              onClick={onInstall}
              disabled={locked}
              loading={busy === "install"}
            >
              安装 / 更新
            </Button>
            <Button
              type="primary"
              size="large"
              shape="round"
              icon={<PlayCircleOutlined aria-hidden="true" />}
              onClick={onLaunch}
              loading={busy === "launch"}
              disabled={locked || !status.installed}
              title={status.installed ? "启动游戏" : "需先安装加载器"}
            >
              启动游戏
            </Button>
          </Space>
        </div>
      </div>
    </div>
  );
}
