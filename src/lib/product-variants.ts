import type { VariantInput } from "@/lib/products";

/** Every combination of option values, in option order: [["S","Red"],["S","Blue"],["M","Red"],…]. */
export function combinations(options: readonly { values: readonly string[] }[]): string[][] {
  return options.reduce<string[][]>(
    (acc, option) => acc.flatMap((prefix) => option.values.map((value) => [...prefix, value])),
    [[]],
  );
}

/** Splits "S, M, L" into trimmed, non-empty, de-duplicated values (case-insensitively), in order. */
export function parseValues(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of text.split(",")) {
    const value = piece.trim().replace(/\s+/g, " ");
    const key = value.toLowerCase();
    if (value && !seen.has(key)) {
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}

export const MAX_VARIANTS = 100;

export function newVariant(optionValues: string[], price = ""): VariantInput {
  return {
    optionValues,
    sku: "",
    barcode: "",
    price,
    compareAtPrice: null,
    costPerItem: null,
    taxable: true,
    trackInventory: true,
    inventoryPolicy: "DENY",
    requiresShipping: true,
    weight: null,
    mediaId: null,
  };
}

/**
 * Rebuilds the variant list after the options changed: combinations that already exist keep everything the person
 * typed (matched by their option values); new combinations get blank rows with the given default price.
 * Returns null when the combinations would exceed Shopify's limit.
 */
export function reconcileVariants(
  options: readonly { values: readonly string[] }[],
  existing: readonly VariantInput[],
  defaultPrice: string,
): VariantInput[] | null {
  const combos = combinations(options);
  if (combos.length > MAX_VARIANTS) return null;
  const byKey = new Map(existing.map((v) => [v.optionValues.join("\u0000"), v]));
  return combos.map(
    (values) => byKey.get(values.join("\u0000")) ?? newVariant(values, defaultPrice),
  );
}
