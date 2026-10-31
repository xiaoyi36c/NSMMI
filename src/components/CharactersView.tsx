import { memo, useMemo } from "react";

import { ModList } from "./ModList";
import { displayModName } from "../lib/modGroup";
import type { BusyAction, ModItem } from "../types";

interface CharactersViewProps {
  mods: ModItem[];
  busy: BusyAction;
  /** 侧栏搜索关键字（过滤 Mod 名） */
  query: string;
  onToggle: (name: string) => void;
  onRefresh: () => void;
  onOpenFolder: () => void;
}

/** 角色管理：Mod 启停与目录管理 */
export const CharactersView = memo(function CharactersView({
  mods,
  busy,
  query,
  onToggle,
  onRefresh,
  onOpenFolder,
}: CharactersViewProps) {
  const keyword = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      keyword
        ? mods.filter(
            (mod) =>
              mod.name.toLowerCase().includes(keyword) ||
              displayModName(mod.name).toLowerCase().includes(keyword),
          )
        : mods,
    [mods, keyword],
  );

  return (
    <div className="page-wrap">
      <ModList
        mods={visible}
        busy={busy}
        onToggle={onToggle}
        onRefresh={onRefresh}
        onOpenFolder={onOpenFolder}
      />
    </div>
  );
});
