import { memo } from "react";
import { GithubOutlined, SettingOutlined } from "@ant-design/icons";
import { Tooltip } from "./SafeTooltip";

import iconSource from "../../assets/icon-source.png";
import type { View } from "../types";
import { NAV_ENTRIES } from "./nav";

interface RailProps {
  view: View;
  /** 游戏是否在运行（首页图标角标） */
  gameRunning: boolean;
  onSelect: (view: View) => void;
  onOpenRepo: () => void;
}

/** 最左侧图标栏：应用标识 + 主导航 + 底部仓库/设置 */
export const Rail = memo(function Rail({
  view,
  gameRunning,
  onSelect,
  onOpenRepo,
}: RailProps) {
  return (
    <nav className="rail" aria-label="主导航">
      <button
        type="button"
        className="rail-logo"
        onClick={() => onSelect("home")}
        aria-label="NSMMI 首页"
        title="NSMMI"
      >
        <img src={iconSource} alt="" />
      </button>

      <div className="rail-nav">
        {NAV_ENTRIES.map((entry) => {
          const Icon = entry.icon;
          const active = view === entry.key;
          return (
            <Tooltip key={entry.key} title={entry.label} placement="right" mouseEnterDelay={0.2}>
              <button
                type="button"
                className={`rail-btn${active ? " active" : ""}`}
                onClick={() => onSelect(entry.key)}
                aria-label={entry.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon aria-hidden="true" />
                {entry.key === "home" && gameRunning && (
                  <span className="rail-dot" aria-hidden="true" />
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div className="rail-bottom">
        <Tooltip title="GitHub 仓库" placement="right" mouseEnterDelay={0.2}>
          <button
            type="button"
            className="rail-btn"
            onClick={onOpenRepo}
            aria-label="打开 GitHub 仓库"
          >
            <GithubOutlined aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip title="设置" placement="right" mouseEnterDelay={0.2}>
          <button
            type="button"
            className={`rail-btn${view === "settings" ? " active" : ""}`}
            onClick={() => onSelect("settings")}
            aria-label="设置"
            aria-current={view === "settings" ? "page" : undefined}
          >
            <SettingOutlined aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </nav>
  );
});
