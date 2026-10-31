import { memo, useMemo, useState } from "react";
import { AppstoreOutlined, InboxOutlined, RightOutlined } from "@ant-design/icons";

import { DUMP_KINDS, dumpKind, dumpLabel, filterDumps } from "../../lib/dumps";
import type { DumpFile, DumpFilter } from "../../types";

interface DumpsPanelProps {
  dumps: DumpFile[];
  /** 侧栏搜索关键字（匹配文件名 / 备注） */
  query: string;
  filter: DumpFilter;
  onFilterChange: (filter: DumpFilter) => void;
}

/** 资源抓取页的中间栏：全部 → 按类型分组 → 具体文件（点击筛选右侧列表） */
export const DumpsPanel = memo(function DumpsPanel({
  dumps,
  query,
  filter,
  onFilterChange,
}: DumpsPanelProps) {
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

  // 中间栏本身就是筛选器，这里只按关键字收窄，类型/文件选择交给右侧
  const visible = useMemo(
    () => filterDumps(dumps, { kind: "all", file: null }, query),
    [dumps, query],
  );

  const groups = useMemo(
    () =>
      DUMP_KINDS.map((kind) => ({
        ...kind,
        files: visible.filter((dump) => dumpKind(dump.name) === kind.id),
      })).filter((group) => group.files.length > 0),
    [visible],
  );

  return (
    <>
      <button
        type="button"
        className={`panel-item${filter.kind === "all" && !filter.file ? " active" : ""}`}
        onClick={() => onFilterChange({ kind: "all", file: null })}
        aria-current={filter.kind === "all" && !filter.file ? "page" : undefined}
      >
        <AppstoreOutlined className="panel-item-icon" aria-hidden="true" />
        <span className="panel-item-label">全部抓取</span>
        {dumps.length > 0 && <span className="panel-item-count">{dumps.length}</span>}
      </button>

      {groups.length === 0 ? (
        <div className="panel-empty">
          <InboxOutlined className="panel-empty-icon" aria-hidden="true" />
          <p className="panel-empty-title">
            {dumps.length === 0 ? "还没有抓取记录" : "没有匹配的文件"}
          </p>
          <p className="panel-empty-hint">
            {dumps.length === 0 ? "游戏内开启狩猎模式后 dump，再点右上角刷新" : "换个关键词试试"}
          </p>
        </div>
      ) : (
        groups.map((group) => {
          const open = closedGroups[group.id] !== true;
          return (
            <div className="panel-group" key={group.id}>
              <button
                type="button"
                className="panel-group-head nested"
                onClick={() => setClosedGroups((prev) => ({ ...prev, [group.id]: open }))}
                aria-expanded={open}
              >
                <RightOutlined
                  className={`panel-chevron${open ? " open" : ""}`}
                  aria-hidden="true"
                />
                <span className="panel-group-label">{group.label}</span>
                <span className="panel-group-count">{group.files.length}</span>
              </button>

              {open &&
                group.files.map((dump) => {
                  const active = filter.file === dump.name;
                  return (
                    <button
                      key={dump.name}
                      type="button"
                      className={`panel-item panel-item-leaf${active ? " active" : ""}`}
                      title={dump.note ? `${dump.name} · ${dump.note}` : dump.name}
                      onClick={() =>
                        onFilterChange(
                          active
                            ? { kind: group.id, file: null }
                            : { kind: group.id, file: dump.name },
                        )
                      }
                    >
                      <span className={`panel-dump-dot ${group.id}`} aria-hidden="true" />
                      <span className="panel-item-label">
                        {dump.note || dumpLabel(dump.name)}
                      </span>
                    </button>
                  );
                })}
            </div>
          );
        })
      )}
    </>
  );
});
