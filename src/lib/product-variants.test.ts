import { describe, expect, it } from "vitest";

import {
  combinations,
  MAX_VARIANTS,
  newVariant,
  parseValues,
  reconcileVariants,
} from "./product-variants";

describe("option values and combinations", () => {
  it("parses comma-separated values, trimming, de-duplicating and dropping blanks", () => {
    expect(parseValues(" Small, Medium ,, large,  Large , small ")).toEqual([
      "Small",
      "Medium",
      "large",
    ]);
    expect(parseValues("")).toEqual([]);
    expect(parseValues("  a   b ,c")).toEqual(["a b", "c"]);
  });

  it("builds every combination in option order", () => {
    expect(combinations([{ values: ["S", "M"] }, { values: ["Red", "Blue"] }])).toEqual([
      ["S", "Red"],
      ["S", "Blue"],
      ["M", "Red"],
      ["M", "Blue"],
    ]);
    expect(combinations([])).toEqual([[]]);
    expect(combinations([{ values: ["Only"] }])).toEqual([["Only"]]);
  });
});

describe("reconcileVariants", () => {
  it("keeps what was typed for combinations that still exist and adds blank rows for new ones", () => {
    const small = { ...newVariant(["S"], "10"), sku: "KEEP", compareAtPrice: "12" };
    const result = reconcileVariants([{ values: ["S", "M"] }], [small], "9.99");
    expect(result).toHaveLength(2);
    expect(result?.[0]).toBe(small);
    expect(result?.[1]).toMatchObject({ optionValues: ["M"], price: "9.99", sku: "" });
  });

  it("drops rows whose combination no longer exists", () => {
    const large = newVariant(["L"], "5");
    expect(
      reconcileVariants([{ values: ["S"] }], [large], "1")?.map((v) => v.optionValues),
    ).toEqual([["S"]]);
  });

  it("refuses more variants than Shopify allows", () => {
    const many = Array.from({ length: MAX_VARIANTS + 1 }, (_, i) => `v${i}`);
    expect(reconcileVariants([{ values: many }], [], "1")).toBeNull();
    expect(reconcileVariants([{ values: many.slice(0, MAX_VARIANTS) }], [], "1")).toHaveLength(
      MAX_VARIANTS,
    );
  });
});
