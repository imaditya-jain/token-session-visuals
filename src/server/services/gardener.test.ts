// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const storefront = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/shopify/client", () => ({ storefrontQuery: storefront.query }));
vi.mock("@/server/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { getGardenerService } from "./gardener";

const product = (overrides: Record<string, unknown> = {}) => ({
  title: "Garden Care Visit",
  availableForSale: true,
  variants: {
    nodes: [
      { id: "gid://shopify/ProductVariant/1", price: { amount: "60.0", currencyCode: "USD" } },
    ],
  },
  sellingPlanGroups: {
    nodes: [
      {
        sellingPlans: {
          nodes: [
            {
              id: "gid://shopify/SellingPlan/1",
              name: "Monthly garden visit",
              priceAdjustments: [{ adjustmentValue: { price: { amount: "50.0" } } }],
            },
            // A percentage adjustment has no fixed price: it cannot be shown as "$X per visit", so it is skipped.
            {
              id: "gid://shopify/SellingPlan/2",
              name: "Odd plan",
              priceAdjustments: [{ adjustmentValue: {} }],
            },
          ],
        },
      },
    ],
  },
  ...overrides,
});

beforeEach(() => storefront.query.mockReset());

describe("getGardenerService", () => {
  it("maps the product and its fixed-price plans", async () => {
    storefront.query.mockResolvedValue({ product: product() });
    expect(await getGardenerService()).toEqual({
      title: "Garden Care Visit",
      variantId: "gid://shopify/ProductVariant/1",
      currency: "USD",
      oneTimePrice: "60.0",
      plans: [{ id: "gid://shopify/SellingPlan/1", name: "Monthly garden visit", price: "50.0" }],
    });
  });

  it.each([
    ["the product is not published", { product: null }],
    ["it cannot be bought", { product: product({ availableForSale: false }) }],
    ["it has no variant", { product: product({ variants: { nodes: [] } }) }],
  ])("returns null when %s", async (_label, response) => {
    storefront.query.mockResolvedValue(response);
    expect(await getGardenerService()).toBeNull();
  });

  it("returns null (never throws) when Shopify fails or answers garbage", async () => {
    storefront.query.mockRejectedValueOnce(new Error("down"));
    expect(await getGardenerService()).toBeNull();
    storefront.query.mockResolvedValueOnce({ product: { title: 1 } });
    expect(await getGardenerService()).toBeNull();
  });
});
