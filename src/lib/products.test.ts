import { describe, expect, it } from "vitest";

import { variantInputSchema } from "./products";

describe("variantInputSchema", () => {
  it("turns an omitted or empty compare-at price and cost into null, never an empty string", () => {
    const omitted = variantInputSchema.parse({ optionValues: [], price: "10.00" });
    expect(omitted.compareAtPrice).toBeNull();
    expect(omitted.costPerItem).toBeNull();
    const empty = variantInputSchema.parse({
      optionValues: [],
      price: "10.00",
      compareAtPrice: "",
      costPerItem: "",
    });
    expect(empty.compareAtPrice).toBeNull();
    expect(empty.costPerItem).toBeNull();
  });
});
