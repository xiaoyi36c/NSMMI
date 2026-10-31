import { memo } from "react";
import {
  Button,
  Card,
  Input,
  Space,
  Tag,
  Typography,
} from "antd";
import { FolderOpenOutlined, RocketOutlined } from "@ant-design/icons";

import type { BusyAction, LoaderUpdateInfo, Status } from "../types";

interface GameCardProps {
  path: string;
  pathValid: boolean | null;
  onPathChange: (value: string) => void;
  status: Status;
  gameExe: string;
  busy: BusyAction;
  loaderUpdate: LoaderUpdateInfo | null;
  onDetect: () => void;
  onBrowse: () => void;
  onInstall: () => void;
  onLaunch: () => void;
  onRestore: () => void;
  onUninstall: () => void;
  onOpenMod: () => void;
  onOpenShaderFixes: () => void;
  onOpenGameDir: () => void;
}

export const GameCard = memo(function GameCard({
  path,
  pathValid,
  onPathChange,
  status,
  gameExe,
  busy,
  loaderUpdate,
  onDetect,
  onBrowse,
  onInstall,
  onLaunch,
  onRestore,
  onUninstall,
  onOpenMod,
  onOpenShaderFixes,
  onOpenGameDir,
}: GameCardProps) {
  const locked = busy !== null;
  const hasPath = path.trim().length > 0;
  const pathKnown = pathValid === true;

  const hint =
    pathValid === true
      ? {
          type: "success" as const,
          text: !status.installed
            ? `已找到 ${gameExe}，尚未准备加载器`
            : status.modLoaded
              ? "3DMigoto 已注入游戏进程，Mod 生效中"
              : status.injected
                ? "加载器已注入，等待游戏加载（进入游戏后生效）"
                : status.legacyResident
                  ? "检测到旧版常驻加载器：点「重新准备」把它们撤出游戏目录"
                  : "已就绪：点「启动游戏」把 3DMigoto 注入游戏进程，游戏目录不落文件",
        }
      : pathValid === false
        ? {
            type: "danger" as const,
            text: `该目录下未找到 ${gameExe}，请重新选择`,
          }
        : {
            type: "secondary" as const,
            text: `填写游戏根目录（${gameExe} 所在位置），或点击自动检测`,
          };

  return (
    <Card
      title="游戏目录"
      extra={
        <Space size={8}>
          {loaderUpdate?.hasUpdate && (
            <Tag color="processing">3DMigoto 可更新 {loaderUpdate.latest}</Tag>
          )}
          {status.gameRunning && <Tag color="warning">游戏运行中</Tag>}
          {status.injected && (
            <Tag color={status.modLoaded ? "success" : "processing"}>
              {status.modLoaded ? "Mod 已加载" : "已注入"}
            </Tag>
          )}
          {status.legacyResident && <Tag color="error">常驻残留</Tag>}
          {status.installed ? (
            <Tag color="success">已就绪</Tag>
          ) : (
            <Tag>未准备</Tag>
          )}
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            id="game-path"
            name="gamePath"
            value={path}
            onChange={(event) => onPathChange(event.target.value)}
            onPressEnter={() => {
              // 回车快捷安装，目录未校验通过时不触发
              if (pathKnown && !locked) {
                onInstall();
              }
            }}
            status={pathValid === false ? "error" : undefined}
            spellCheck={false}
            autoComplete="off"
            placeholder={`例如 E:\\Netease\\逆水寒手游\\game…`}
            style={{ fontFamily: "Consolas, monospace", userSelect: "text" }}
          />
          <Button onClick={onBrowse} disabled={locked} icon={<FolderOpenOutlined aria-hidden="true" />}>
            浏览…
          </Button>
          <Button onClick={onDetect} loading={busy === "detect"} disabled={locked}>
            自动检测
          </Button>
        </Space.Compact>

        <Typography.Text type={hint.type} style={{ fontSize: 12 }} aria-live="polite">
          {hint.text}
        </Typography.Text>

        <Space wrap style={{ rowGap: 8 }}>
          <Button
            type="primary"
            onClick={onInstall}
            loading={busy === "install"}
            disabled={locked || pathValid === false}
            title={
              pathValid === false
                ? `目录下未找到 ${gameExe}`
                : status.installed
                  ? "刷新加载器缓存并迁移 Mod / ShaderFixes"
                  : "准备工作目录，也可直接点「启动游戏」自动完成"
            }
          >
            {status.installed ? "重新准备" : "准备加载器"}
          </Button>
          <Button
            type="primary"
            ghost
            icon={<RocketOutlined aria-hidden="true" />}
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
          {status.injected && (
            <Button
              onClick={onRestore}
              loading={busy === "restore"}
              disabled={locked}
              title="清理旧版残留在游戏目录里的加载器（已注入的加载器随游戏退出卸载）"
            >
              取消注入
            </Button>
          )}
          <Button
            danger
            onClick={onUninstall}
            loading={busy === "uninstall"}
            disabled={locked || !status.installed}
            title={status.installed ? "按安装清单还原原文件并清除 NSMMI 目录" : "当前未准备"}
          >
            卸载
          </Button>
          <Button type="text" onClick={onOpenMod} disabled={!hasPath}>
            Mod 目录
          </Button>
          <Button type="text" onClick={onOpenShaderFixes} disabled={!hasPath}>
            ShaderFixes
          </Button>
          <Button type="text" onClick={onOpenGameDir} disabled={!hasPath}>
            游戏目录
          </Button>
        </Space>
      </Space>
    </Card>
  );
});
