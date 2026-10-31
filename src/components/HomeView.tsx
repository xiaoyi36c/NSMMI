import { useCallback, useEffect, useRef, useState } from "react";
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
  /** 版本徽章用哪套玻璃：壁纸深→白字，壁纸浅→深字，无壁纸→主题默认 */
  badge: "glass-dark" | "glass-light" | "plain";
  status: Status;
  busy: BusyAction;
  version: string | null;
  loaderUpdate: LoaderUpdateInfo | null;
  onLaunch: () => void;
  onInstall: () => void;
  /** 「⋮」菜单：检查更新 */
  onCheckUpdate: () => Promise<void>;
  /** 「⋮」菜单：重新准备加载器（取消注入并清理旧版残留） */
  onRestore: () => Promise<void>;
  /** 「⋮」菜单：在桌面创建快速启动快捷方式 */
  onAddShortcut: () => Promise<void>;
  onOpenMod: () => Promise<void>;
  onOpenShaderFixes: () => Promise<void>;
  onOpenGameDir: () => Promise<void>;
}

/**
 * 主页：与其它页面共用同一框架（侧栏 + 内容区），
 * 内容区直接透出壁纸，文字在左上、按钮在右下。
 */
export function HomeView({
  onDark,
  badge,
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

  const subColor = onDark ? "rgba(255,255,255,0.85)" : undefined;
  const textShadow = onDark ? "0 1px 6px rgba(0,0,0,0.45)" : undefined;

  // 运行状态（常驻显示）
  const runtime = !status.installed
    ? { text: "尚未准备加载器", color: "warning" }
    : status.modLoaded
      ? { text: "Mod 已在游戏内生效", color: "success" }
      : status.injected
        ? { text: "加载器已注入，等待游戏加载", color: "processing" }
        : status.legacyResident
          ? { text: "检测到旧版常驻加载器", color: "warning" }
          : { text: "环境已就绪", color: "success" };

  // 操作提示：菜单动作的进行中 / 结果反馈，短暂显示后回到运行状态
  const [hint, setHint] = useState<{ text: string; color: string } | null>(null);
  const hintTimer = useRef(0);
  const flash = useCallback((text: string, color = "success", ms = 3500) => {
    window.clearTimeout(hintTimer.current);
    setHint({ text, color });
    hintTimer.current = window.setTimeout(() => setHint(null), ms);
  }, []);
  useEffect(() => () => window.clearTimeout(hintTimer.current), []);

  // 检查更新的结果经 loaderUpdate 回流，在这里变成提示
  useEffect(() => {
    if (!loaderUpdate) {
      return;
    }
    if (loaderUpdate.hasUpdate) {
      flash(`发现 3DMigoto 新版本 ${loaderUpdate.latest}，可点「更新加载器」升级`, "warning", 6000);
    } else {
      flash(`3DMigoto 已是最新版本 ${loaderUpdate.current}`);
    }
  }, [loaderUpdate, flash]);

  // 就绪态不显示副标题，保持画面干净；仅需要引导时给出说明
  const subtitle = !status.installed
    ? "点「启动游戏」会自动准备加载器并启动，也可以先点「安装 / 更新」。"
    : status.legacyResident
      ? "游戏目录里还留着旧版加载器（正常启动也会加载），到「设置」点「重新准备」即可撤出。"
      : null;

  const runMenu = (key: string) => {
    if (key === "update") {
      flash("正在检查更新…", "processing", 15000);
      void onCheckUpdate();
    } else if (key === "mods") {
      void onOpenMod().then(() => flash("已在文件管理器打开 Mod 目录"));
    } else if (key === "shaderfixes") {
      void onOpenShaderFixes().then(() => flash("已在文件管理器打开 ShaderFixes"));
    } else if (key === "game") {
      void onOpenGameDir().then(() => flash("已在文件管理器打开游戏目录"));
    } else if (key === "restore") {
      flash("正在重新准备加载器…", "processing", 30000);
      void onRestore().then(() => flash("重新准备完成，详见日志页"));
    } else if (key === "shortcut") {
      flash("正在创建桌面快捷方式…", "processing", 15000);
      void onAddShortcut().then(() => flash("桌面快捷方式已创建"));
    }
  };

  return (
    <div className="home-page">
      <div className="home-foot">
        <div
          className={`home-version${
            badge === "glass-dark" ? " on-glass" : badge === "glass-light" ? " light-wall" : ""
          }`}
        >
          <span>NSMMI {version ?? "—"}</span>
          <span className="sep" aria-hidden="true" />
          <span>3DMigoto {status.loaderVersion || "—"}</span>
        </div>

        <div className="home-actions">
          <div className="home-copy">
            {subtitle && (
              <Typography.Paragraph style={{ color: subColor, textShadow, marginBottom: 0 }}>
                {subtitle}
              </Typography.Paragraph>
            )}
            <Tag
              color={(hint ?? runtime).color}
              style={{
                marginInlineEnd: 0,
                borderRadius: 999,
                padding: "4px 16px",
                fontSize: 13,
                lineHeight: 1.6,
                boxShadow: onDark ? "0 2px 10px rgba(0,0,0,0.18)" : undefined,
              }}
            >
              {(hint ?? runtime).text}
            </Tag>
          </div>

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
              onClick: ({ key }) => runMenu(key),
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
    </div>
  );
}
