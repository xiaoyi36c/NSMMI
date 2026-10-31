import { memo, useMemo, useState } from "react";
import { Input } from "antd";
import {
  AppstoreOutlined,
  InboxOutlined,
  RightOutlined,
  SearchOutlined,
} from "@ant-design/icons";

import { displayModName, groupMods } from "../lib/modGroup";
import type {
  DumpFile,
  DumpFilter,
  LogEntry,
  LogFilter,
  ModItem,
  View,
} from "../types";
import { DumpsPanel } from "./panels/DumpsPanel";
import { LogsPanel } from "./panels/LogsPanel";
import { SectionPanel } from "./panels/SectionPanel";
import type { PanelSection } from "./panels/SectionPanel";
import { NAV_ENTRIES, NAV_GROUPS } from "./nav";

/** 调试模式页的分区（对应 DebugView 里的卡片） */
const DEBUG_SECTIONS: PanelSection[] = [
  { id: "debug-core", label: "3DMigoto 调试" },
  { id: "debug-overlay", label: "调试悬浮窗" },
  { id: "debug-keys", label: "游戏内按键" },
];

/** 设置页的分区（对应 SettingsView 里的卡片） */
const SETTINGS_SECTIONS: PanelSection[] = [
  { id: "settings-game", label: "游戏目录" },
  { id: "settings-launch", label: "启动" },
  { id: "settings-update", label: "加载器更新" },
  { id: "settings-theme", label: "主题" },
  { id: "settings-display", label: "显示" },
  { id: "settings-about", label: "关于" },
];

interface SidePanelProps {
  view: View;
  query: string;
  mods: ModItem[];
  dumps: DumpFile[];
  logs: LogEntry[];
  dumpFilter: DumpFilter;
  logFilter: LogFilter;
  /** 分区导航（调试 / 设置）当前定位到的分区 */
  sectionId: string | null;
  onQueryChange: (query: string) => void;
  onDumpFilterChange: (filter: DumpFilter) => void;
  onLogFilterChange: (level: LogFilter) => void;
  onJumpSection: (id: string) => void;
  onSelect: (view: View) => void;
}

/** 各页面的搜索框提示文案 */
const SEARCH_PLACEHOLDER: Partial<Record<View, string>> = {
  characters: "搜索模型 / 场景",
  dumps: "搜索文件 / 备注",
  logs: "搜索日志",
  debug: "搜索分区",
  settings: "搜索分区",
};

/** 中间面板：搜索 + 当前页的目录 / 筛选器（每页内容不同） */
export const SidePanel = memo(function SidePanel({
  view,
  query,
  mods,
  dumps,
  logs,
  dumpFilter,
  logFilter,
  sectionId,
  onQueryChange,
  onDumpFilterChange,
  onLogFilterChange,
  onJumpSection,
  onSelect,
}: SidePanelProps) {
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

  const keyword = query.trim().toLowerCase();
  const isCharacters = view === "characters";

  const groups = useMemo(() => {
    const source = keyword
      ? mods.filter((mod) => displayModName(mod.name).toLowerCase().includes(keyword))
      : mods;
    return groupMods(source);
  }, [mods, keyword]);

  const counts: Partial<Record<View, number>> = {
    characters: mods.length,
    dumps: dumps.length,
    logs: logs.length,
  };

  const renderNavRow = (key: View) => {
    const entry = NAV_ENTRIES.find((item) => item.key === key);
    if (!entry) {
      return null;
    }
    const Icon = entry.icon;
    const active = view === entry.key;
    const count = counts[entry.key];
    return (
      <button
        key={entry.key}
        type="button"
        className={`panel-item${active ? " active" : ""}`}
        onClick={() => onSelect(entry.key)}
        aria-current={active ? "page" : undefined}
      >
        <Icon className="panel-item-icon" aria-hidden="true" />
        <span className="panel-item-label">{entry.label}</span>
        {count !== undefined && count > 0 && (
          <span className="panel-item-count">{count}</span>
        )}
      </button>
    );
  };

  const groupedHead = (
    id: string,
    label: string,
    count: number | null,
    indent: boolean,
  ) => {
    const open = closedGroups[id] !== true;
    return (
      <button
        type="button"
        className={`panel-group-head${indent ? " nested" : ""}`}
        onClick={() => setClosedGroups((prev) => ({ ...prev, [id]: open }))}
        aria-expanded={open}
      >
        <RightOutlined className={`panel-chevron${open ? " open" : ""}`} aria-hidden="true" />
        <span className="panel-group-label">{label}</span>
        {count !== null && <span className="panel-group-count">{count}</span>}
      </button>
    );
  };

  return (
    <aside className="panel" aria-label="侧栏">
      <Input
        className="panel-search"
        variant="borderless"
        allowClear
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        prefix={<SearchOutlined aria-hidden="true" />}
        placeholder={SEARCH_PLACEHOLDER[view] ?? "搜索"}
        aria-label="搜索"
      />

      <div className="panel-list">
        {isCharacters ? (
          <>
            <button
              type="button"
              className={`panel-item${keyword ? "" : " active"}`}
              onClick={() => onQueryChange("")}
              aria-current={keyword ? undefined : "page"}
            >
              <AppstoreOutlined className="panel-item-icon" aria-hidden="true" />
              <span className="panel-item-label">全部模型</span>
              {mods.length > 0 && <span className="panel-item-count">{mods.length}</span>}
            </button>

            {groups.length === 0 ? (
              <div className="panel-empty">
                <InboxOutlined className="panel-empty-icon" aria-hidden="true" />
                <p className="panel-empty-title">
                  {mods.length === 0 ? "Mod 目录还是空的" : "没有匹配的模型 / 场景"}
                </p>
                <p className="panel-empty-hint">
                  {mods.length === 0
                    ? "把 .ini 与配套资源放进 Mod 目录即可"
                    : "换个关键词试试"}
                </p>
              </div>
            ) : (
              groups.map((group) => {
                const open = closedGroups[group.id] !== true;
                return (
                  <div className="panel-group" key={group.id}>
                    {groupedHead(group.id, group.label, group.mods.length, true)}
                    {open &&
                      group.mods.map((mod) => {
                        const label = displayModName(mod.name);
                        return (
                          <button
                            key={mod.name}
                            type="button"
                            className={`panel-item panel-item-leaf${
                              keyword && label.toLowerCase().includes(keyword) ? " active" : ""
                            }`}
                            onClick={() => onQueryChange(label)}
                            title={mod.name}
                          >
                            <span
                              className={`panel-mod-dot${mod.enabled ? "" : " off"}`}
                              aria-hidden="true"
                            />
                            <span className="panel-item-label">{label}</span>
                          </button>
                        );
                      })}
                  </div>
                );
              })
            )}
          </>
        ) : view === "dumps" ? (
          <DumpsPanel
            dumps={dumps}
            query={query}
            filter={dumpFilter}
            onFilterChange={onDumpFilterChange}
          />
        ) : view === "logs" ? (
          <LogsPanel
            logs={logs}
            query={query}
            level={logFilter}
            onLevelChange={onLogFilterChange}
          />
        ) : view === "debug" || view === "settings" ? (
          <SectionPanel
            sections={view === "debug" ? DEBUG_SECTIONS : SETTINGS_SECTIONS}
            query={query}
            activeId={sectionId}
            onJump={onJumpSection}
          />
        ) : keyword ? (
          (() => {
            const matched = NAV_ENTRIES.filter((entry) =>
              entry.label.toLowerCase().includes(keyword),
            );
            return matched.length > 0 ? (
              matched.map((entry) => renderNavRow(entry.key))
            ) : (
              <div className="panel-empty">
                <InboxOutlined className="panel-empty-icon" aria-hidden="true" />
                <p className="panel-empty-title">没有匹配的项目</p>
                <p className="panel-empty-hint">换个关键词试试</p>
              </div>
            );
          })()
        ) : (
          NAV_GROUPS.map((group) => {
            const entries = NAV_ENTRIES.filter((entry) => entry.group === group.id);
            const open = closedGroups[group.id] !== true;
            return (
              <div className="panel-group" key={group.id}>
                {groupedHead(group.id, group.label, null, false)}
                {open && entries.map((entry) => renderNavRow(entry.key))}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
});
