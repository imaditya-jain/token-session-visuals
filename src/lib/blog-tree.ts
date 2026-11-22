import type { CategoryView } from "@/lib/blog-types";

export type TreeRow = { category: CategoryView; depth: number };

/**
 * Orders categories as a tree for display: parents before their children, siblings by name. Categories whose
 * parent is missing are shown at the top level, and a cycle (which the API prevents) can't loop forever.
 */
export function flattenCategories(categories: readonly CategoryView[]): TreeRow[] {
  const ids = new Set(categories.map((c) => c.id));
  const childrenOf = new Map<string | null, CategoryView[]>();
  for (const category of categories) {
    const key = category.parentId && ids.has(category.parentId) ? category.parentId : null;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), category]);
  }
  const byName = (a: CategoryView, b: CategoryView) => a.name.localeCompare(b.name);
  const rows: TreeRow[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const category of [...(childrenOf.get(parent) ?? [])].sort(byName)) {
      if (seen.has(category.id)) continue;
      seen.add(category.id);
      rows.push({ category, depth });
      walk(category.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

/** Ids of a category and everything beneath it (to keep it out of its own "parent" choices). */
export function subtreeIds(id: string, categories: readonly CategoryView[]): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const category of categories) {
      if (category.parentId && out.has(category.parentId) && !out.has(category.id)) {
        out.add(category.id);
        grew = true;
      }
    }
  }
  return out;
}
