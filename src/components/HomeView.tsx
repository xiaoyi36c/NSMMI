import { Button, Dropdown, Space, Tag, Typography } from "antd";
import {
  CloudDownloadOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  FileImageOutlined,
  FolderOpenOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  RedoOutlined,
} from "@ant-design/icons";

import type { BusyAction, LoaderUpdateInfo, Status } from "../types";

interface HomeViewProps {
  /** 深色背景（自定义壁纸或深色主题），文字用浅色 */
  onDark: boolean;
  status: Status;
  busy: BusyAction;
  version: string | null;
  loaderUpdate: LoaderUpdateInfo | null;
  onLaunch: () => void;
  onInstall: () => void;
  /** 「⋮」菜单：检查更新 */
  onCheckUpdate: () => void;
  /** 「⋮」菜单：重新准备加载器（取消注入并清理旧版残留） */
  onRestore: () => void;
  /** 「⋮」菜单：在桌面创建快速启动快捷方式 */
  onAddShortcut: () => void;
  onOpenMod: () => void;
  onOpenShaderFixes: () => void;
  onOpenGameDir: () => void;
}

/**
 * 主页：与其它页面共用同一框架（侧栏 + 内容区），
 * 内容区直接透出壁纸，文字在左上、按钮在右下。
 */
export function HomeView({
  onDark,
  status,
  busy,
  version,
  loaderUpdate,
  onLaunch,
  onInstall,
  onCheckUpdate,
  onRestore,
  onAddShortcut,
  onOpenMod,
  onOpenShaderFixes,
  onOpenGameDir,
}: HomeViewProps) {
  const locked = busy !== null;
  // 已安装且无加载器更新时隐藏；有更新时显示「更新」
  const showInstall = !status.installed || loaderUpdate?.hasUpdate === true;
  const installLabel = status.installed ? "更新加载器" : "准备加载器";

  const textColor = onDark ? "#fff" : undefined;
  const subColor = onDark ? "rgba(255,255,255,0.85)" : undefined;
  const textShadow = onDark ? "0 1px 6px rgba(0,0,0,0.45)" : undefined;

  const title = !status.installed
    ? "尚未准备加载器"
    : status.modLoaded
      ? "3DMigoto 已注入游戏进程（Mod 生效中）"
      : status.injected
        ? "加载器已注入，等待游戏加载"
        : status.legacyResident
          ? "检测到旧版常驻加载器"
          : "已就绪，点击「启动游戏」";

  const subtitle = !status.installed
    ? "点「启动游戏」会自动准备加载器并启动，也可以先点「安装 / 更新」。"
    : status.legacyResident
      ? "游戏目录里还留着旧版加载器（正常启动也会加载），到「设置」点「重新准备」即可撤出。"
      : "启动游戏时把 3DMigoto 注入游戏进程，游戏目录始终保持原版；不通过 NSMMI 启动就不会加载。";

  return (
    <div className="home-page">
      <div className="home-copy">
        <Typography.Title level={3} style={{ color: textColor, marginTop: 0, textShadow }}>
          {title}
        </Typography.Title>
        <Typography.Paragraph style={{ color: subColor, textShadow }}>
          {subtitle}
        </Typography.Paragraph>
        {status.injected && (
          <Tag color={status.modLoaded ? "success" : "processing"}>
            {status.modLoaded ? "Mod 已在游戏内生效" : "加载器已就位，等待游戏加载"}
          </Tag>
        )}
      </div>

      <div className="home-foot">
        <Typography.Text
          style={{ color: subColor, fontSize: 12, fontFamily: "Consolas, monospace", textShadow }}
        >
          NSMMI {version ?? ""} · 3DMigoto {status.loaderVersion || "—"}
        </Typography.Text>

        <Space size={12} wrap>
          {showInstall && (
            <Button
              ghost={onDark}
              onClick={onInstall}
              loading={busy === "install"}
              title={
                status.installed
                  ? "刷新加载器缓存并迁移 Mod / ShaderFixes"
                  : "准备工作目录（也可直接点「启动游戏」自动完成）"
              }
            >
              {installLabel}
            </Button>
          )}
          <Button
            type="primary"
            size="large"
            shape="round"
            className="home-launch"
            icon={<PlayCircleOutlined aria-hidden="true" />}
            onClick={onLaunch}
            loading={busy === "launch"}
            disabled={locked}
            title={
              status.installed
                ? "把 3DMigoto 注入游戏进程并启动，游戏目录不落文件"
                : "首次启动会自动准备加载器，然后注入 3DMigoto"
            }
          >
            启动游戏
          </Button>
          <Dropdown
            trigger={["click"]}
            placement="topRight"
            menu={{
              items: [
                {
                  key: "update",
                  icon: <CloudDownloadOutlined aria-hidden="true" />,
                  label: "检查更新",
                  disabled: locked,
                },
                {
                  key: "mods",
                  icon: <FolderOpenOutlined aria-hidden="true" />,
                  label: "打开 Mod 目录",
                },
                {
                  key: "restore",
                  icon: <RedoOutlined aria-hidden="true" />,
                  label: "重新准备加载器",
                  disabled: locked,
                },
                {
                  key: "shortcut",
                  icon: <DesktopOutlined aria-hidden="true" />,
                  label: "添加桌面快捷方式",
                  disabled: locked,
                },
                { type: "divider" },
                {
                  key: "shaderfixes",
                  icon: <FileImageOutlined aria-hidden="true" />,
                  label: "打开 ShaderFixes",
                },
                { key: "game", icon: <DatabaseOutlined aria-hidden="true" />, label: "打开游戏目录" },
              ],
              onClick: ({ key }) => {
                if (key === "update") {
                  onCheckUpdate();
                } else if (key === "mods") {
                  onOpenMod();
                } else if (key === "shaderfixes") {
                  onOpenShaderFixes();
                } else if (key === "game") {
                  onOpenGameDir();
                } else if (key === "restore") {
                  onRestore();
                } else if (key === "shortcut") {
                  onAddShortcut();
                }
              },
            }}
          >
            <Button
              size="large"
              shape="circle"
              ghost={onDark}
              icon={<MoreOutlined aria-hidden="true" />}
              aria-label="更多操作"
              title="更多操作"
            />
          </Dropdown>
        </Space>
      </div>
    </div>
  );
}
