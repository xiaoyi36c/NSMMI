import { Button, Space, Typography } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";

import type { BusyAction, Status } from "../types";

interface HomeViewProps {
  /** 深色背景（自定义壁纸或深色主题），文字用浅色 */
  onDark: boolean;
  status: Status;
  busy: BusyAction;
  version: string | null;
  onLaunch: () => void;
  onInstall: () => void;
}

/** 主页：背景（壁纸/主题由全局渲染）+ 大启动按钮 */
export function HomeView({
  onDark,
  status,
  busy,
  version,
  onLaunch,
  onInstall,
}: HomeViewProps) {
  const locked = busy !== null;

  const textColor = onDark ? "#fff" : undefined;
  const subColor = onDark ? "rgba(255,255,255,0.85)" : undefined;
  const textShadow = onDark ? "0 1px 6px rgba(0,0,0,0.45)" : undefined;

  return (
    <div className="home-view">
      <div className="home-content">
        <div style={{ maxWidth: 480 }}>
          <Typography.Title
            level={3}
            style={{ color: textColor, marginTop: 0, textShadow }}
          >
            {status.installed ? "已就绪，随时启动游戏" : "尚未安装加载器"}
          </Typography.Title>
          <Typography.Paragraph style={{ color: subColor, textShadow }}>
            {status.installed
              ? "mod 放入游戏目录的 Mods\\ 即自动加载，按 F10 重载配置。"
              : "在「设置」中定位游戏目录并安装，随后即可启动。"}
          </Typography.Paragraph>
        </div>

        <div className="home-bottom">
          <Typography.Text
            style={{ color: subColor, fontSize: 12, fontFamily: "Consolas, monospace", textShadow }}
          >
            NSMMI {version ?? ""} · 3DMigoto 1.4.9
          </Typography.Text>

          <Space size={12}>
            <Button
              ghost={onDark}
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
              className="home-launch"
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
