import { CloseOutlined, GithubOutlined, MinusOutlined } from "@ant-design/icons";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { REPO_URL } from "../constants";
import { isTauri } from "../lib/tauri-env";

interface TitleBarProps {
  /** 首页铺满壁纸时标题栏透明悬浮 */
  overlay: boolean;
  onOpenExternal: (url: string) => void;
}

/** 无边框窗口的自定义标题栏（页面导航在左侧菜单） */
export function TitleBar({ overlay, onOpenExternal }: TitleBarProps) {
  return (
    <header
      data-tauri-drag-region
      className={`titlebar${overlay ? " overlay" : ""}`}
    >
      <div className="titlebar-brand" data-tauri-drag-region>
        <span aria-hidden="true" className="titlebar-logo">
          N
        </span>
        <span className="titlebar-title">NSMMI</span>
      </div>

      <div className="titlebar-actions" data-tauri-drag-region="false">
        <button
          type="button"
          onClick={() => void onOpenExternal(REPO_URL)}
          aria-label="打开 GitHub 仓库"
          className="titlebar-btn window"
        >
          <GithubOutlined aria-hidden="true" />
        </button>

        {isTauri && (
          <>
            <button
              type="button"
              aria-label="最小化"
              onClick={() => void getCurrentWindow().minimize()}
              className="titlebar-btn window"
            >
              <MinusOutlined aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="关闭"
              onClick={() => void getCurrentWindow().close()}
              className="titlebar-btn window close"
            >
              <CloseOutlined aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
