import type { DumpFile, DumpFilter, DumpKind } from "../types";

/** 分组顺序：模型 shader → 贴图 → 其它 */
export const DUMP_KINDS: { id: DumpKind; label: string }[] = [
  { id: "shader", label: "模型 shader" },
  { id: "texture", label: "贴图" },
  { id: "other", label: "其它文件" },
];

/** 按扩展名判定 dump 类型 */
export function dumpKind(name: string): DumpKind {
  const lower = name.toLowerCase();
  if (lower.endsWith(".txt")) {
    return "shader";
  }
  if (lower.endsWith(".dds")) {
    return "texture";
  }
  return "other";
}

/** 文件名去掉扩展名，作为列表里的短名 */
export function dumpLabel(name: string): string {
  return name.replace(/\.(txt|dds|bin|buf)$/i, "");
}

/** 关键词命中文件名或备注 */
export function matchDump(dump: DumpFile, keyword: string): boolean {
  if (!keyword) {
    return true;
  }
  return (
    dump.name.toLowerCase().includes(keyword) ||
    (dump.note ?? "").toLowerCase().includes(keyword)
  );
}

/** 侧栏与右侧列表共用同一套筛选，保证两边看到的结果一致 */
export function filterDumps(
  dumps: DumpFile[],
  filter: DumpFilter,
  query: string,
): DumpFile[] {
  const keyword = query.trim().toLowerCase();
  return dumps.filter((dump) => {
    if (filter.file && dump.name !== filter.file) {
      return false;
    }
    if (filter.kind !== "all" && dumpKind(dump.name) !== filter.kind) {
      return false;
    }
    return matchDump(dump, keyword);
  });
}
