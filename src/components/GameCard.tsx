import { memo } from "react";
import {
  Button,
  Card,
  Input,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  FolderOpenOutlined,
  RocketOutlined,
} from "@ant-design/icons";

import { formatTime } from "../lib/format";
import type { BusyAction, Status } from "../types";

interface GameCardProps {
  path: string;
  pathValid: boolean | null;
  onPathChange: (value: string) => void;
  status: Status;
  gameExe: string;
  busy: BusyAction;
  onDetect: () => void;
  onBrowse: () => void;
  onInstall: () => void;
  onLaunch: () => void;
  onUninstall: () => void;
  onOpenMods: () => void;
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
  onDetect,
  onBrowse,
  onInstall,
  onLaunch,
  onUninstall,
  onOpenMods,
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
          text: `已找到 ${gameExe}${
            status.installed ? `，${formatTime(status.installedAt)} 安装` : ""
          }`,
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
          {status.gameRunning && <Tag color="warning">游戏运行中</Tag>}
          {status.installed ? (
            <Tag color="success">已安装</Tag>
          ) : (
            <Tag>未安装</Tag>
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
            title={pathValid === false ? `目录下未找到 ${gameExe}` : "备份原文件并部署加载器"}
          >
            安装 / 更新
          </Button>
          <Button
            type="primary"
            ghost
            icon={<RocketOutlined aria-hidden="true" />}
            onClick={onLaunch}
            loading={busy === "launch"}
            disabled={locked || !status.installed}
            title={status.installed ? "启动游戏" : "需先安装加载器"}
          >
            启动游戏
          </Button>
          <Button
            danger
            onClick={onUninstall}
            loading={busy === "uninstall"}
            disabled={locked || !status.installed}
            title={status.installed ? "按安装清单还原原文件" : "当前未安装"}
          >
            卸载
          </Button>
          <Button type="text" onClick={onOpenMods} disabled={!hasPath}>
            Mods 目录
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
