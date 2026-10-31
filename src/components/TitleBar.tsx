import { useState } from "react";
import {
  CloseOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  MinusOutlined,
  PushpinFilled,
  PushpinOutlined,
} from "@ant-design/icons";
import { Tooltip } from "./SafeTooltip";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { isTauri } from "../lib/tauri-env";

interface TitleBarProps {
  /** 铺壁纸时标题栏透明悬浮 */
  overlay: boolean;
  /** 壁纸标题栏区域为浅色 → 使用深色图标 */
  adaptiveDark?: boolean;
}

/** 无边框窗口的自定义标题栏：细条，仅保留窗口按钮（品牌在左侧图标栏） */
export function TitleBar({ overlay, adaptiveDark }: TitleBarProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [onTop, setOnTop] = useState(false);

  const toggleFullscreen = async () => {
    const win = getCurrentWindow();
    const next = !(await win.isFullscreen());
    await win.setFullscreen(next);
    setFullscreen(next);
  };

  const toggleOnTop = async () => {
    // 直接按本地状态翻转：回读 isAlwaysOnTop 在窗口刚切换时可能拿到旧值
    const next = !onTop;
    try {
      await getCurrentWindow().setAlwaysOnTop(next);
      setOnTop(next);
    } catch (error) {
      console.warn("切换窗口置顶失败", error);
    }
  };

  return (
    <header
      className={`titlebar${overlay ? " overlay" : ""}${
        overlay && adaptiveDark ? " adaptive-dark" : ""
      }`}
    >
      <div className="titlebar-drag" data-tauri-drag-region />
      <div className="titlebar-actions" data-tauri-drag-region="false">
        {isTauri && (
          <>
            <Tooltip title={fullscreen ? "退出全屏" : "全屏"} placement="bottom" mouseEnterDelay={0.3}>
              <button
                type="button"
                aria-label={fullscreen ? "退出全屏" : "全屏"}
                onClick={() => void toggleFullscreen()}
                className="titlebar-btn window"
              >
                {fullscreen ? (
                  <FullscreenExitOutlined aria-hidden="true" />
                ) : (
                  <FullscreenOutlined aria-hidden="true" />
                )}
              </button>
            </Tooltip>
            <Tooltip
              title={onTop ? "取消置顶" : "窗口置顶"}
              placement="bottom"
              mouseEnterDelay={0.3}
            >
              <button
                type="button"
                aria-label={onTop ? "取消置顶" : "窗口置顶"}
                aria-pressed={onTop}
                onClick={() => void toggleOnTop()}
                className={`titlebar-btn window${onTop ? " active" : ""}`}
              >
                {onTop ? (
                  <PushpinFilled aria-hidden="true" />
                ) : (
                  <PushpinOutlined aria-hidden="true" />
                )}
              </button>
            </Tooltip>
            <Tooltip title="最小化" placement="bottom" mouseEnterDelay={0.3}>
              <button
                type="button"
                aria-label="最小化"
                onClick={() => void getCurrentWindow().minimize()}
                className="titlebar-btn window"
              >
                <MinusOutlined aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip title="关闭" placement="bottom" mouseEnterDelay={0.3}>
              <button
                type="button"
                aria-label="关闭"
                onClick={() => void getCurrentWindow().close()}
                className="titlebar-btn window close"
              >
                <CloseOutlined aria-hidden="true" />
              </button>
            </Tooltip>
          </>
        )}
      </div>
    </header>
  );
}
