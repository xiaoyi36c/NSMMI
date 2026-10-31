import type { ModItem } from "../types";

/** 分组定义：按 Mod 名里的关键词归类（命中越靠前优先级越高） */
export interface ModCategory {
  id: string;
  label: string;
  keywords: string[];
}

/** 角色管理侧栏的分组顺序：人物 → 场景 → 武器 → 特效 → 其它 */
export const MOD_CATEGORIES: ModCategory[] = [
  {
    id: "character",
    label: "人物模型",
    keywords: [
      "角色",
      "人物",
      "模型",
      "时装",
      "衣服",
      "皮肤",
      "捏脸",
      "body",
      "char",
      "character",
      "npc",
      "hair",
      "face",
      "cloth",
      "dress",
    ],
  },
  {
    id: "scene",
    label: "场景",
    keywords: [
      "场景",
      "地图",
      "环境",
      "建筑",
      "山水",
      "城镇",
      "地形",
      "scene",
      "map",
      "env",
      "stage",
      "world",
    ],
  },
  {
    id: "weapon",
    label: "武器",
    keywords: ["武器", "剑", "刀", "枪", "弓", "weapon", "sword", "blade", "bow"],
  },
  {
    id: "effect",
    label: "特效",
    keywords: ["特效", "光效", "effect", "fx", "vfx", "shader"],
  },
];

export const OTHER_CATEGORY: ModCategory = { id: "other", label: "其它", keywords: [] };

export interface ModGroup {
  id: string;
  label: string;
  mods: ModItem[];
}

/** 侧栏显示用的短名：去掉目录、DISABLED_ 前缀与扩展名 */
export function displayModName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/^DISABLED_/i, "").replace(/\.(ini|txt)$/i, "");
}

function matchCategory(name: string): string {
  const lower = name.toLowerCase();
  for (const category of MOD_CATEGORIES) {
    if (category.keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) {
      return category.id;
    }
  }
  return OTHER_CATEGORY.id;
}

/** 按关键词把 Mod 分组（空分组会被丢掉，保持固定顺序） */
export function groupMods(mods: ModItem[]): ModGroup[] {
  const buckets = new Map<string, ModItem[]>();
  for (const mod of mods) {
    const id = matchCategory(`${mod.name} ${displayModName(mod.name)}`);
    const list = buckets.get(id);
    if (list) {
      list.push(mod);
    } else {
      buckets.set(id, [mod]);
    }
  }

  const ordered = [...MOD_CATEGORIES, OTHER_CATEGORY];
  return ordered
    .map((category) => ({
      id: category.id,
      label: category.label,
      mods: buckets.get(category.id) ?? [],
    }))
    .filter((group) => group.mods.length > 0);
}
