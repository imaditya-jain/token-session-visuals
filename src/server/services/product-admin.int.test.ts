// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Call = { op: string; variables: Record<string, unknown> };
const calls: Call[] = [];
let handlers: Record<string, (variables: Record<string, unknown>) => unknown> = {};

vi.mock("@/server/shopify/admin", () => ({
  adminQuery: async (query: string, variables: Record<string, unknown>) => {
    const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "anonymous";
    calls.push({ op, variables });
    const handler = handlers[op];
    if (!handler) throw new Error(`No fake for ${op}`);
    const result = handler(variables);
    if (result instanceof Error) throw result;
    return result;
  },
}));

import { createProductSchema, type VariantInput } from "@/lib/products";
import { disconnectDb } from "@/server/db/connection";
import { InventoryAdjustment } from "@/server/db/models/inventory-adjustment";
import { SiteSetting } from "@/server/db/models/site-setting";
import { startTestDatabase } from "@/test/mongo";

import { ShopifyError } from "@/server/shopify/client";

import * as service from "./product-admin";

let server: MongoMemoryServer;
beforeAll(async () => {
  server = await startTestDatabase();
}, 120_000);
afterAll(async () => {
  await disconnectDb();
  await server.stop();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  const { connectDb } = await import("@/server/db/connection");
  await connectDb();
  await Promise.all([InventoryAdjustment.deleteMany({}), SiteSetting.deleteMany({})]);
  calls.length = 0;
  handlers = {};
});

const P = "gid://shopify/Product/1";
const variantNode = (
  id: string,
  values: string[] = ["Default Title"],
  over: Record<string, unknown> = {},
) => ({
  id: `gid://shopify/ProductVariant/${id}`,
  title: values.join(" / "),
  sku: "SKU",
  barcode: null,
  price: "10.00",
  compareAtPrice: null,
  taxable: true,
  inventoryPolicy: "DENY",
  selectedOptions: values.map((value) => ({ name: "Size", value })),
  media: { nodes: [] },
  inventoryItem: {
    id: `gid://shopify/InventoryItem/${id}`,
    tracked: true,
    requiresShipping: true,
    unitCost: { amount: "4.00" },
    measurement: { weight: { value: 0.5, unit: "KILOGRAMS" } },
    inventoryLevels: {
      nodes: [
        {
          id: "gid://shopify/InventoryLevel/1",
          location: { id: "gid://shopify/Location/9", name: "Shop" },
          quantities: [
            { name: "available", quantity: 7 },
            { name: "on_hand", quantity: 9 },
            { name: "committed", quantity: 2 },
          ],
        },
      ],
    },
  },
  ...over,
});
const productNode = (variants = [variantNode("11")], over: Record<string, unknown> = {}) => ({
  shop: { currencyCode: "USD" },
  publications: {
    nodes: [
      { id: "gid://shopify/Publication/1", name: "Online Store" },
      { id: "gid://shopify/Publication/2", name: "Headless" },
    ],
  },
  product: {
    id: P,
    title: "Fern",
    handle: "fern",
    descriptionHtml: "<p>Nice</p>",
    status: "DRAFT",
    vendor: "Fernwood",
    productType: "Plants",
    tags: ["a"],
    updatedAt: "2026-01-01T00:00:00Z",
    seo: { title: null, description: null },
    options: [
      { id: "gid://shopify/ProductOption/1", name: "Size", position: 1, values: ["Default Title"] },
    ],
    media: {
      nodes: [
        {
          id: "gid://shopify/MediaImage/5",
          alt: null,
          image: { url: "https://cdn.shopify.com/a.png", width: 10, height: 10 },
        },
      ],
    },
    collections: { nodes: [{ id: "gid://shopify/Collection/1", title: "House Plants" }] },
    resourcePublicationsV2: {
      nodes: [{ isPublished: true, publication: { id: "gid://shopify/Publication/1" } }],
    },
    variants: { nodes: variants },
    ...over,
  },
});
const ok = (key: string, extra: Record<string, unknown> = {}) => ({
  [key]: { userErrors: [], ...extra },
});

const variant = (over: Partial<VariantInput> = {}): VariantInput => ({
  optionValues: [],
  sku: "SKU-1",
  barcode: "",
  price: "12.50",
  compareAtPrice: null,
  costPerItem: null,
  taxable: true,
  trackInventory: true,
  inventoryPolicy: "DENY",
  requiresShipping: true,
  weight: null,
  mediaId: null,
  ...over,
});
const createInput = (over: Record<string, unknown> = {}) =>
  createProductSchema.parse({
    product: { title: "Fern", descriptionHtml: "<p>Hello</p>", status: "DRAFT" },
    options: [],
    variants: [variant()],
    ...over,
  });
const opsCalled = () => calls.map((c) => c.op);
const CH1 = "gid://shopify/Publication/1";
const CH2 = "gid://shopify/Publication/2";
/** Two channels exist; the product is on the ones listed. */
const channelState = (on: string[]) => () => ({
  publications: {
    nodes: [
      { id: CH1, name: "Online Store" },
      { id: CH2, name: "Headless" },
    ],
  },
  product: {
    resourcePublicationsV2: { nodes: on.map((id) => ({ isPublished: true, publication: { id } })) },
  },
});
const published = () => ({ publishablePublish: { userErrors: [] } });
const unpublished = () => ({ publishableUnpublish: { userErrors: [] } });

describe("reading", () => {
  it("lists products with a safe search filter and pagination", async () => {
    handlers["ListProducts"] = () => ({
      products: {
        pageInfo: { hasNextPage: true, endCursor: "CUR" },
        nodes: [
          {
            id: P,
            title: "Fern",
            handle: "fern",
            status: "ACTIVE",
            vendor: "V",
            productType: "T",
            tags: ["x"],
            totalInventory: 5,
            tracksInventory: true,
            updatedAt: "2026-01-01T00:00:00Z",
            variantsCount: { count: 2 },
            featuredMedia: { preview: { image: { url: "https://cdn.shopify.com/i.png" } } },
            priceRangeV2: {
              minVariantPrice: { amount: "10.0", currencyCode: "USD" },
              maxVariantPrice: { amount: "20.0", currencyCode: "USD" },
            },
          },
        ],
      },
    });
    const page = await service.fetchProducts({
      search: 'fern" OR status:archived\\',
      status: "ACTIVE",
      after: "AFTER",
    });
    expect(page.nextCursor).toBe("CUR");
    expect(page.items[0]).toMatchObject({
      title: "Fern",
      variantCount: 2,
      priceMin: "10.0",
      priceMax: "20.0",
      imageUrl: "https://cdn.shopify.com/i.png",
    });
    const query = String(calls[0]?.variables["query"]);
    expect(query).toContain("status:active");
    expect(query).not.toMatch(/["\\]/);
    // The colon that would let a visitor add their own filter is gone from the search words.
    expect(query).not.toContain("OR status:archived");
    expect(calls[0]?.variables["after"]).toBe("AFTER");
  });

  it("maps a product with its variants, stock levels, cost and weight", async () => {
    handlers["GetProduct"] = () => productNode();
    const product = await service.readProduct(P);
    expect(product).toMatchObject({ title: "Fern", seoTitle: "", currency: "USD" });
    expect(product.variants[0]).toMatchObject({
      price: "10.00",
      costPerItem: "4.00",
      weight: { value: 0.5, unit: "KILOGRAMS" },
      trackInventory: true,
    });
    expect(product.variants[0]?.levels[0]).toMatchObject({
      locationName: "Shop",
      quantities: { available: 7, onHand: 9, committed: 2 },
    });
    expect(product.media[0]).toMatchObject({ alt: "", width: 10 });
  });

  it("answers 404 for a product that doesn't exist", async () => {
    handlers["GetProduct"] = () => ({
      shop: { currencyCode: "USD" },
      publications: { nodes: [] },
      product: null,
    });
    await expect(service.readProduct(P)).rejects.toMatchObject({
      status: 404,
      code: "product_not_found",
    });
  });

  it("strips scripts and handlers from descriptions read from Shopify", async () => {
    handlers["GetProduct"] = () =>
      productNode([variantNode("11")], {
        descriptionHtml: '<p onclick="x()">Hi</p><script>alert(1)</script><img src=x onerror=1>',
      });
    const { descriptionHtml } = await service.readProduct(P);
    expect(descriptionHtml).toBe("<p>Hi</p>");
  });
});

describe("creating a product", () => {
  beforeEach(() => {
    handlers["ChannelState"] = channelState([]);
    handlers["PublishProduct"] = published;
  });

  const created = () => ({ productCreate: { product: { id: P, handle: "fern" }, userErrors: [] } });

  it("makes a single-variant product by reshaping Shopify's starter variant", async () => {
    handlers["CreateProduct"] = () => created();
    handlers["GetProduct"] = () => productNode();
    handlers["UpdateVariants"] = () =>
      ok("productVariantsBulkUpdate", { productVariants: [{ id: "x" }] });
    const product = await service.createProduct(
      createInput({
        product: {
          title: "Fern",
          descriptionHtml: "<p>Hi</p><script>bad()</script>",
          status: "DRAFT",
        },
      }),
    );
    expect(product.id).toBe(P);
    expect(opsCalled()).toEqual([
      "CreateProduct",
      "GetProduct",
      "UpdateVariants",
      "ChannelState",
      "PublishProduct",
      "GetProduct",
    ]);
    const sent = calls[0]?.variables["product"] as Record<string, unknown>;
    expect(sent["descriptionHtml"]).toBe("<p>Hi</p>");
    const update = (calls[2]?.variables["variants"] as Record<string, unknown>[])[0];
    expect(update).toMatchObject({
      id: "gid://shopify/ProductVariant/11",
      price: "12.50",
      inventoryItem: { sku: "SKU-1", tracked: true },
    });
  });

  it("with options, updates the starter and creates only the other combinations", async () => {
    handlers["CreateProduct"] = () => created();
    handlers["GetProduct"] = () =>
      productNode([variantNode("11", ["Small"])], {
        options: [{ id: "o1", name: "Size", position: 1, values: ["Small", "Medium", "Large"] }],
      });
    handlers["UpdateVariants"] = () => ok("productVariantsBulkUpdate", { productVariants: [] });
    handlers["CreateVariants"] = () =>
      ok("productVariantsBulkCreate", { productVariants: [{ id: "a" }, { id: "b" }] });
    await service.createProduct(
      createInput({
        options: [{ name: "Size", values: ["Small", "Medium", "Large"] }],
        variants: [
          variant({ optionValues: ["Small"] }),
          variant({ optionValues: ["Medium"], price: "15" }),
          variant({ optionValues: ["Large"], price: "18" }),
        ],
      }),
    );
    const createdSent = calls.find((c) => c.op === "CreateVariants")?.variables["variants"] as {
      price: string;
      optionValues: unknown[];
    }[];
    expect(createdSent.map((v) => v.price)).toEqual(["15", "18"]);
    expect(createdSent[0]?.optionValues).toEqual([{ optionName: "Size", name: "Medium" }]);
  });

  it("deletes the product again when a later step fails, so nothing half-built is left", async () => {
    handlers["CreateProduct"] = () => created();
    handlers["GetProduct"] = () => productNode();
    handlers["UpdateVariants"] = () => ({
      productVariantsBulkUpdate: {
        productVariants: null,
        userErrors: [
          { field: ["variants", "0", "price"], message: "Price must be greater than 0" },
        ],
      },
    });
    handlers["DeleteProduct"] = () => ({ productDelete: { deletedProductId: P, userErrors: [] } });
    await expect(service.createProduct(createInput())).rejects.toMatchObject({
      status: 422,
      code: "shopify_rejected",
      message: "Price must be greater than 0",
    });
    expect(opsCalled()).toContain("DeleteProduct");
  });

  it("reports Shopify's refusal of the product itself without calling anything else", async () => {
    handlers["CreateProduct"] = () => ({
      productCreate: {
        product: null,
        userErrors: [{ field: ["title"], message: "Title can't be blank" }],
      },
    });
    await expect(service.createProduct(createInput())).rejects.toMatchObject({
      status: 422,
      message: "Title can't be blank",
    });
    expect(opsCalled()).toEqual(["CreateProduct"]);
  });
});

describe("publishing to sales channels", () => {
  it("puts a new product on every channel it isn't on yet, so customers can see it", async () => {
    handlers["CreateProduct"] = () => ({
      productCreate: { product: { id: P, handle: "fern" }, userErrors: [] },
    });
    handlers["GetProduct"] = () => productNode();
    handlers["UpdateVariants"] = () => ok("productVariantsBulkUpdate", { productVariants: [] });
    handlers["ChannelState"] = channelState([CH1]);
    handlers["PublishProduct"] = published;
    await service.createProduct(createInput());
    expect(calls.find((c) => c.op === "PublishProduct")?.variables).toEqual({
      id: P,
      input: [{ publicationId: CH2 }],
    });
  });

  it("removes a product that couldn't be published, rather than leaving it invisible", async () => {
    handlers["CreateProduct"] = () => ({
      productCreate: { product: { id: P, handle: "fern" }, userErrors: [] },
    });
    handlers["GetProduct"] = () => productNode();
    handlers["UpdateVariants"] = () => ok("productVariantsBulkUpdate", { productVariants: [] });
    handlers["ChannelState"] = channelState([]);
    handlers["PublishProduct"] = () => ({
      publishablePublish: { userErrors: [{ field: null, message: "Publication not found" }] },
    });
    handlers["DeleteProduct"] = () => ({ productDelete: { deletedProductId: P, userErrors: [] } });
    await expect(service.createProduct(createInput())).rejects.toMatchObject({
      status: 422,
      message: "Publication not found",
    });
    expect(opsCalled()).toContain("DeleteProduct");
  });

  it("makes sure an Active product is published, and leaves drafts alone", async () => {
    handlers["GetProduct"] = () => productNode();
    handlers["UpdateProduct"] = () => ({
      productUpdate: { product: { id: P, handle: "fern" }, userErrors: [] },
    });
    handlers["ChannelState"] = channelState([CH1]);
    handlers["PublishProduct"] = published;
    await service.updateProduct(P, { status: "DRAFT" });
    expect(opsCalled()).not.toContain("PublishProduct");
    await service.updateProduct(P, { status: "ACTIVE" });
    expect(opsCalled()).toContain("PublishProduct");
    expect(calls.find((c) => c.op === "PublishProduct")?.variables["input"]).toEqual([
      { publicationId: CH2 },
    ]);
  });

  it("publishes nothing when the product is already everywhere", async () => {
    handlers["GetProduct"] = () => productNode();
    handlers["UpdateProduct"] = () => ({
      productUpdate: { product: { id: P, handle: "fern" }, userErrors: [] },
    });
    handlers["ChannelState"] = channelState([CH1, CH2]);
    await service.updateProduct(P, { status: "ACTIVE" });
    expect(opsCalled()).not.toContain("PublishProduct");
  });

  it("reports which channels a product is on", async () => {
    handlers["GetProduct"] = () => productNode();
    const product = await service.readProduct(P);
    expect(product.channels).toEqual([
      { id: CH1, name: "Online Store", published: true },
      { id: CH2, name: "Headless", published: false },
    ]);
  });

  it("sets exactly the chosen channels: publishes the added, withdraws the removed, refuses unknown ones", async () => {
    handlers["GetProduct"] = () => productNode();
    handlers["ChannelState"] = channelState([CH1]);
    handlers["PublishProduct"] = published;
    handlers["UnpublishProduct"] = unpublished;
    await service.setChannels(P, [CH2]);
    expect(calls.find((c) => c.op === "PublishProduct")?.variables["input"]).toEqual([
      { publicationId: CH2 },
    ]);
    expect(calls.find((c) => c.op === "UnpublishProduct")?.variables["input"]).toEqual([
      { publicationId: CH1 },
    ]);
    calls.length = 0;
    await expect(service.setChannels(P, ["gid://shopify/Publication/999"])).rejects.toMatchObject({
      code: "channel_not_found",
    });
    expect(opsCalled()).toEqual(["ChannelState"]);
  });
});

describe("validation of create requests", () => {
  const parse = (v: unknown) => createProductSchema.safeParse(v);
  const base = { product: { title: "Fern" }, options: [], variants: [variant()] };
  it("accepts money only as exact decimal strings", () => {
    expect(parse(base).success).toBe(true);
    for (const price of ["", "abc", "1.234", "-5", "1e3", "12,50", " "]) {
      expect(parse({ ...base, variants: [variant({ price })] }).success, price).toBe(false);
    }
  });
  it("requires a title, valid handle and a variant", () => {
    expect(parse({ ...base, product: { title: "  " } }).success).toBe(false);
    expect(parse({ ...base, product: { title: "x", handle: "Bad Handle" } }).success).toBe(false);
    expect(parse({ ...base, variants: [] }).success).toBe(false);
  });
  it("ties variants to options", () => {
    expect(parse({ ...base, options: [{ name: "Size", values: ["S"] }] }).success).toBe(false);
    expect(parse({ ...base, variants: [variant(), variant()] }).success).toBe(false);
  });
  it("rejects bad ids and control characters", () => {
    expect(
      parse({ ...base, product: { title: "x", collectionIds: ["gid://shopify/Product/1"] } })
        .success,
    ).toBe(false);
    expect(parse({ ...base, product: { title: "x\ny" } }).success).toBe(false);
  });
});

describe("updating", () => {
  it("joins and leaves collections by comparing with what the product has now", async () => {
    handlers["GetProduct"] = () => productNode();
    handlers["UpdateProduct"] = () => ({
      productUpdate: { product: { id: P, handle: "fern" }, userErrors: [] },
    });
    await service.updateProduct(P, {
      title: "Fern 2",
      collectionIds: ["gid://shopify/Collection/2"],
    });
    const sent = calls.find((c) => c.op === "UpdateProduct")?.variables["product"] as Record<
      string,
      unknown
    >;
    expect(sent).toMatchObject({
      id: P,
      title: "Fern 2",
      collectionsToJoin: ["gid://shopify/Collection/2"],
      collectionsToLeave: ["gid://shopify/Collection/1"],
    });
  });

  it("archives and restores through the status", async () => {
    handlers["UpdateProduct"] = () => ({
      productUpdate: { product: { id: P, handle: "fern" }, userErrors: [] },
    });
    await service.archiveProduct(P, true);
    await service.archiveProduct(P, false);
    expect(calls.map((c) => (c.variables["product"] as { status: string }).status)).toEqual([
      "ARCHIVED",
      "DRAFT",
    ]);
  });

  it("deletes permanently and synchronously", async () => {
    handlers["DeleteProduct"] = () => ({ productDelete: { deletedProductId: P, userErrors: [] } });
    await service.deleteProduct(P);
    expect(calls[0]?.variables).toEqual({ input: { id: P } });
  });
});

describe("variants", () => {
  const two = () =>
    productNode([variantNode("11", ["Small"]), variantNode("12", ["Large"])], {
      options: [{ id: "o1", name: "Size", position: 1, values: ["Small", "Large"] }],
    });

  it("updates those with an id and creates those without", async () => {
    handlers["GetProduct"] = () => two();
    handlers["UpdateVariants"] = () => ok("productVariantsBulkUpdate", { productVariants: [] });
    handlers["CreateVariants"] = () =>
      ok("productVariantsBulkCreate", { productVariants: [{ id: "n" }] });
    await service.saveVariants(P, [
      variant({ id: "gid://shopify/ProductVariant/11", optionValues: ["Small"], price: "11" }),
      variant({ optionValues: ["Medium"], price: "14" }),
    ]);
    expect(opsCalled()).toEqual(["GetProduct", "UpdateVariants", "CreateVariants", "GetProduct"]);
  });

  it("refuses a variant with the wrong number of option values or from another product", async () => {
    handlers["GetProduct"] = () => two();
    await expect(service.saveVariants(P, [variant({ optionValues: [] })])).rejects.toMatchObject({
      code: "variant_options",
    });
    await expect(
      service.saveVariants(P, [
        variant({ id: "gid://shopify/ProductVariant/999", optionValues: ["Small"] }),
      ]),
    ).rejects.toMatchObject({ code: "variant_not_found" });
    expect(opsCalled()).not.toContain("UpdateVariants");
  });

  it("removes variants, but never the last one", async () => {
    handlers["GetProduct"] = () => two();
    handlers["DeleteVariants"] = () => ok("productVariantsBulkDelete");
    await service.removeVariants(P, ["gid://shopify/ProductVariant/12"]);
    expect(opsCalled()).toContain("DeleteVariants");
    calls.length = 0;
    await expect(
      service.removeVariants(P, [
        "gid://shopify/ProductVariant/11",
        "gid://shopify/ProductVariant/12",
      ]),
    ).rejects.toMatchObject({ code: "last_variant" });
    await expect(
      service.removeVariants(P, ["gid://shopify/ProductVariant/55"]),
    ).rejects.toMatchObject({ code: "variant_not_found" });
    expect(opsCalled()).not.toContain("DeleteVariants");
  });
});

describe("images and options", () => {
  it("adds images from the library and removes and reorders them", async () => {
    handlers["GetProduct"] = () => productNode();
    handlers["AddImages"] = () => ok("productUpdate");
    handlers["DeleteImages"] = () => ({ productDeleteMedia: { mediaUserErrors: [] } });
    handlers["ReorderImages"] = () => ({ productReorderMedia: { mediaUserErrors: [] } });
    await service.addImages(P, [{ url: "https://cdn.shopify.com/a.png", alt: "A" }]);
    await service.removeImages(P, ["gid://shopify/MediaImage/5"]);
    await service.reorderImages(P, ["gid://shopify/MediaImage/6", "gid://shopify/MediaImage/5"]);
    expect(calls.find((c) => c.op === "AddImages")?.variables["media"]).toEqual([
      { originalSource: "https://cdn.shopify.com/a.png", alt: "A", mediaContentType: "IMAGE" },
    ]);
    expect(calls.find((c) => c.op === "ReorderImages")?.variables["moves"]).toEqual([
      { id: "gid://shopify/MediaImage/6", newPosition: "0" },
      { id: "gid://shopify/MediaImage/5", newPosition: "1" },
    ]);
  });

  it("adds, renames and deletes options", async () => {
    handlers["GetProduct"] = () => productNode();
    handlers["AddOption"] = () => ok("productOptionsCreate");
    handlers["UpdateOption"] = () => ok("productOptionUpdate");
    handlers["DeleteOption"] = () => ok("productOptionsDelete");
    await service.addOption(P, { name: "Pot", values: ["Clay", "Glazed"] });
    await service.updateOption(P, {
      id: "gid://shopify/ProductOption/1",
      name: "Height",
      addValues: ["Tall"],
    });
    await service.deleteOption(P, "gid://shopify/ProductOption/1");
    expect(calls.find((c) => c.op === "AddOption")?.variables["options"]).toEqual([
      { name: "Pot", values: [{ name: "Clay" }, { name: "Glazed" }] },
    ]);
    expect(calls.find((c) => c.op === "UpdateOption")?.variables).toMatchObject({
      option: { id: "gid://shopify/ProductOption/1", name: "Height" },
      add: [{ name: "Tall" }],
    });
  });
});

describe("failures are reported honestly", () => {
  it("maps outages to 503 with no internals, and unexpected shapes to 502", async () => {
    handlers["GetProduct"] = () =>
      new ShopifyError("Shopify Admin responded 500 secret-token", 500);
    const outage = await service.readProduct(P).catch((e) => e);
    expect(outage).toMatchObject({ status: 503, code: "shopify_unavailable" });
    expect(outage.message).not.toMatch(/secret|500/);
    handlers["GetProduct"] = () => ({ nonsense: true });
    await expect(service.readProduct(P)).rejects.toMatchObject({
      status: 502,
      code: "shopify_unexpected",
    });
  });

  it("says so when Shopify isn't connected, without calling it", async () => {
    vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "");
    const { resetEnvCache } = await import("@/server/config/env");
    resetEnvCache();
    await expect(service.readProduct(P)).rejects.toMatchObject({
      status: 503,
      code: "shopify_not_configured",
    });
    expect(calls).toHaveLength(0);
    vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "shpat_admin_token_for_tests");
    resetEnvCache();
  });
});

describe("inventory", () => {
  const actor = { id: new Types.ObjectId().toString(), name: "Ada Admin" };
  const item = "gid://shopify/InventoryItem/11";
  const loc = "gid://shopify/Location/9";
  const context = (tracked = true) => ({
    inventoryItem: {
      id: item,
      tracked,
      variant: {
        id: "gid://shopify/ProductVariant/11",
        title: "Small",
        sku: "SKU",
        product: { id: P, title: "Fern" },
      },
    },
    location: { id: loc, name: "Shop" },
  });
  const adjusted = (after: number | null = 12) => ({
    inventoryAdjustQuantities: {
      inventoryAdjustmentGroup: {
        id: "gid://shopify/InventoryAdjustmentGroup/1",
        changes: [{ name: "available", quantityAfterChange: after }],
      },
      userErrors: [],
    },
  });

  it("adjusts in Shopify first, then records who did it with the resulting quantity", async () => {
    handlers["ItemContext"] = () => context();
    handlers["Adjust"] = () => adjusted(12);
    const result = await service.adjustStock(actor, {
      inventoryItemId: item,
      locationId: loc,
      delta: 5,
      reason: "received",
      note: "Delivery",
    });
    expect(result.quantityAfter).toBe(12);
    expect(calls.find((c) => c.op === "Adjust")?.variables["input"]).toEqual({
      reason: "received",
      name: "available",
      changes: [{ delta: 5, inventoryItemId: item, locationId: loc }],
    });
    const history = await service.adjustmentHistory({ page: 1, perPage: 10 });
    expect(history.items[0]).toMatchObject({
      productTitle: "Fern",
      variantTitle: "Small",
      sku: "SKU",
      locationName: "Shop",
      delta: 5,
      quantityAfter: 12,
      actorName: "Ada Admin",
      note: "Delivery",
    });
  });

  it("writes nothing to the ledger when Shopify refuses, or when stock isn't tracked", async () => {
    handlers["ItemContext"] = () => context();
    handlers["Adjust"] = () => ({
      inventoryAdjustQuantities: {
        inventoryAdjustmentGroup: null,
        userErrors: [{ field: null, message: "Quantity can't be negative" }],
      },
    });
    await expect(
      service.adjustStock(actor, {
        inventoryItemId: item,
        locationId: loc,
        delta: -50,
        reason: "correction",
        note: "",
      }),
    ).rejects.toMatchObject({ status: 422 });
    handlers["ItemContext"] = () => context(false);
    await expect(
      service.adjustStock(actor, {
        inventoryItemId: item,
        locationId: loc,
        delta: 1,
        reason: "correction",
        note: "",
      }),
    ).rejects.toMatchObject({ code: "not_tracked" });
    handlers["ItemContext"] = () => ({ inventoryItem: null, location: null });
    await expect(
      service.adjustStock(actor, {
        inventoryItemId: item,
        locationId: loc,
        delta: 1,
        reason: "correction",
        note: "",
      }),
    ).rejects.toMatchObject({ code: "inventory_not_found" });
    expect(await InventoryAdjustment.countDocuments()).toBe(0);
  });

  it("filters the history by item and paginates newest first", async () => {
    handlers["ItemContext"] = () => context();
    handlers["Adjust"] = () => adjusted();
    for (const delta of [1, 2, 3]) {
      await service.adjustStock(actor, {
        inventoryItemId: item,
        locationId: loc,
        delta,
        reason: "correction",
        note: "",
      });
      await new Promise((r) => setTimeout(r, 3));
    }
    const page = await service.adjustmentHistory({ page: 1, perPage: 2 });
    expect(page.total).toBe(3);
    expect(page.items.map((i) => i.delta)).toEqual([3, 2]);
    expect(
      (
        await service.adjustmentHistory({
          inventoryItemId: "gid://shopify/InventoryItem/404",
          page: 1,
          perPage: 10,
        })
      ).total,
    ).toBe(0);
  });

  it("keeps the low-stock threshold in the database, with a sensible default", async () => {
    expect(await service.getLowStockThreshold()).toBe(service.DEFAULT_LOW_STOCK);
    await service.setLowStockThreshold(actor.id, 12);
    expect(await service.getLowStockThreshold()).toBe(12);
  });

  it("lists low and sold-out stock using the threshold, leaving out untracked items", async () => {
    await service.setLowStockThreshold(actor.id, 8);
    handlers["LowStock"] = () => ({
      productVariants: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          {
            id: "v1",
            title: "Small",
            sku: "S",
            inventoryQuantity: 3,
            product: { id: P, title: "Fern", featuredMedia: null },
            inventoryItem: { id: item, tracked: true },
          },
          {
            id: "v2",
            title: "Visit",
            sku: null,
            inventoryQuantity: -1,
            product: { id: "p2", title: "Service", featuredMedia: null },
            inventoryItem: { id: "i2", tracked: false },
          },
        ],
      },
    });
    const low = await service.lowStock({ soldOutOnly: false });
    expect(low.threshold).toBe(8);
    expect(low.rows.map((r) => r.variantId)).toEqual(["v1"]);
    expect(calls[0]?.variables["query"]).toBe("inventory_quantity:<=8");
    await service.lowStock({ soldOutOnly: true });
    expect(calls[1]?.variables["query"]).toBe("inventory_quantity:<=0");
  });

  it("starts stocking an item at a location", async () => {
    handlers["Activate"] = () => ok("inventoryActivate");
    await service.stockAt(item, loc, 4);
    expect(calls[0]?.variables).toEqual({ inventoryItemId: item, locationId: loc, available: 4 });
  });
});
