import { describe, expect, it } from "vitest";

import type { CategoryView } from "./blog-types";
import { flattenCategories, subtreeIds } from "./blog-tree";

const cat = (id: string, name: string, parentId: string | null = null): CategoryView => ({
  id,
  name,
  slug: name.toLowerCase(),
  description: "",
  parentId,
  isDefault: false,
  count: 0,
  totalCount: 0,
});

describe("flattenCategories", () => {
  it("lists parents before children, siblings alphabetically, with depth", () => {
    const rows = flattenCategories([
      cat("c", "Watering", "a"),
      cat("b", "Zebra"),
      cat("a", "Care"),
      cat("d", "Misting", "c"),
      cat("e", "Light", "a"),
    ]);
    expect(rows.map((r) => `${"-".repeat(r.depth)}${r.category.name}`)).toEqual([
      "Care",
      "-Light",
      "-Watering",
      "--Misting",
      "Zebra",
    ]);
  });

  it("shows orphans at the top level and survives cycles", () => {
    expect(flattenCategories([cat("a", "Orphan", "missing")]).map((r) => r.depth)).toEqual([0]);
    const looped = flattenCategories([cat("a", "A", "b"), cat("b", "B", "a")]);
    expect(looped.length).toBeLessThanOrEqual(2);
  });
});

describe("subtreeIds", () => {
  it("includes the category and all descendants only", () => {
    const all = [cat("a", "A"), cat("b", "B", "a"), cat("c", "C", "b"), cat("d", "D")];
    expect([...subtreeIds("a", all)].sort()).toEqual(["a", "b", "c"]);
    expect([...subtreeIds("d", all)]).toEqual(["d"]);
  });
});
