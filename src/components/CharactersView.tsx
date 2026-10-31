import { memo } from "react";

import { ModList } from "./ModList";
import type { BusyAction, ModItem } from "../types";

interface CharactersViewProps {
  mods: ModItem[];
  busy: BusyAction;
  onToggle: (name: string) => void;
  onRefresh: () => void;
  onOpenFolder: () => void;
}

/** 角色管理：Mods 启停与目录管理 */
export const CharactersView = memo(function CharactersView({
  mods,
  busy,
  onToggle,
  onRefresh,
  onOpenFolder,
}: CharactersViewProps) {
  return (
    <div className="page-wrap">
      <ModList
        mods={mods}
        busy={busy}
        onToggle={onToggle}
        onRefresh={onRefresh}
        onOpenFolder={onOpenFolder}
      />
    </div>
  );
});
