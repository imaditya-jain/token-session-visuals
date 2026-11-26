// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { earliestDeliveryDate } from "@/lib/gift";
import type { GiftOptions } from "@/lib/gift-schemas";
import { assertBouquetHasDelivery } from "@/server/services/gifts";

vi.mock("server-only", () => ({}));
vi.mock("@/data/catalog", () => ({
  getProducts: vi.fn(async () => [
    {
      id: "1",
      slug: "rose",
      name: "Rose",
      category: "Bouquets",
      price: 40,
      image: "",
      light: "",
      size: "",
      inStock: true,
      variantId: "gid://shopify/ProductVariant/1",
      collectionSlugs: [],
    },
    {
      id: "2",
      slug: "mug",
      name: "Mug",
      category: "Gifts",
      price: 10,
      image: "",
      light: "",
      size: "",
      inStock: true,
      variantId: "gid://shopify/ProductVariant/2",
      collectionSlugs: [],
    },
  ]),
}));

const delivery: GiftOptions = {
  kind: "bouquet",
  recipient: "Asha Patil",
  address: "12 Civil Lines, Nagpur",
  phone: "+91 98765 43210",
  date: earliestDeliveryDate(),
};

describe("assertBouquetHasDelivery", () => {
  it("lets a bouquet in with its delivery details", async () => {
    await expect(
      assertBouquetHasDelivery("gid://shopify/ProductVariant/1", delivery),
    ).resolves.toBeUndefined();
  });

  it("refuses a bouquet without them, or with only a message", async () => {
    await expect(
      assertBouquetHasDelivery("gid://shopify/ProductVariant/1", undefined),
    ).rejects.toMatchObject({ status: 400, code: "delivery_details_required" });
    await expect(
      assertBouquetHasDelivery("gid://shopify/ProductVariant/1", {
        kind: "message",
        message: "hi",
      }),
    ).rejects.toMatchObject({ code: "delivery_details_required" });
  });

  it("does not ask other products for delivery details", async () => {
    await expect(
      assertBouquetHasDelivery("gid://shopify/ProductVariant/2", undefined),
    ).resolves.toBeUndefined();
    await expect(
      assertBouquetHasDelivery("gid://shopify/ProductVariant/999", undefined),
    ).resolves.toBeUndefined();
  });
});
