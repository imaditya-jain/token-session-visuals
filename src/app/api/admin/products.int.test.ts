// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
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

import { disconnectDb } from "@/server/db/connection";
import { AuditLog } from "@/server/db/models/audit-log";
import { EmailJob } from "@/server/db/models/email-job";
import { InventoryAdjustment } from "@/server/db/models/inventory-adjustment";
import { OtpChallenge } from "@/server/db/models/otp-challenge";
import { RateLimit } from "@/server/db/models/rate-limit";
import { Role } from "@/server/db/models/role";
import { SiteSetting } from "@/server/db/models/site-setting";
import { User } from "@/server/db/models/user";
import { ShopifyError } from "@/server/shopify/client";
import { adminSession, apiRequest } from "@/test/admin-session";
import { startTestDatabase } from "@/test/mongo";

import { GET as audit } from "./audit/route";
import { POST as adjust } from "./inventory/adjust/route";
import { GET as history } from "./inventory/history/route";
import { GET as lowStock } from "./inventory/route";
import { GET as getSettings, PUT as putSettings } from "./inventory/settings/route";
import { POST as stock } from "./inventory/stock/route";
import {
  DELETE as removeImage,
  POST as addImage,
  PUT as reorderImage,
} from "./products/[id]/images/route";
import {
  DELETE as deleteOption,
  PATCH as patchOption,
  POST as addOption,
} from "./products/[id]/options/route";
import { PUT as setChannels } from "./products/[id]/channels/route";
import { DELETE as remove, GET as getOne, PATCH as patchProduct } from "./products/[id]/route";
import { DELETE as removeVariant, PUT as saveVariants } from "./products/[id]/variants/route";
import { GET as list, POST as create } from "./products/route";
import { GET as collections } from "./shop/collections/route";
import { GET as locations } from "./shop/locations/route";

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
  await Promise.all(
    [User, RateLimit, EmailJob, OtpChallenge, Role, AuditLog, SiteSetting, InventoryAdjustment].map(
      (m) => (m as unknown as { deleteMany: (f: object) => Promise<unknown> }).deleteMany({}),
    ),
  );
  calls.length = 0;
  handlers = {};
});

const P = "gid://shopify/Product/1";
const json = (r: Response) => r.json();
const productData = (variants: unknown[] = []) => ({
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
    descriptionHtml: "<p>Hi</p>",
    status: "DRAFT",
    vendor: "",
    productType: "",
    tags: [],
    updatedAt: "2026-01-01T00:00:00Z",
    seo: { title: null, description: null },
    options: [
      {
        id: "gid://shopify/ProductOption/1",
        name: "Title",
        position: 1,
        values: ["Default Title"],
      },
    ],
    media: { nodes: [] },
    collections: { nodes: [] },
    resourcePublicationsV2: { nodes: [] },
    variants: { nodes: variants },
  },
});
const variantNode = (n: string) => ({
  id: `gid://shopify/ProductVariant/${n}`,
  title: "Default Title",
  sku: null,
  barcode: null,
  price: "10.00",
  compareAtPrice: null,
  taxable: true,
  inventoryPolicy: "DENY",
  selectedOptions: [{ name: "Title", value: "Default Title" }],
  media: { nodes: [] },
  inventoryItem: {
    id: `gid://shopify/InventoryItem/${n}`,
    tracked: true,
    requiresShipping: true,
    unitCost: null,
    measurement: { weight: null },
    inventoryLevels: { nodes: [] },
  },
});
const ok = (key: string, extra: Record<string, unknown> = {}) => ({
  [key]: { userErrors: [], ...extra },
});
const body = (over: Record<string, unknown> = {}) => ({
  product: { title: "Fern", status: "DRAFT" },
  options: [],
  variants: [{ optionValues: [], price: "10.00" }],
  ...over,
});
const req = (
  path: string,
  method: string,
  token?: string,
  b?: unknown,
  extra: Record<string, unknown> = {},
) =>
  apiRequest(path, method, {
    ...(token ? { token } : {}),
    ...(b !== undefined ? { body: b } : {}),
    ...extra,
  });
const ctx = { params: Promise.resolve({}) };
void ctx;

async function setupProduct() {
  handlers["CreateProduct"] = () => ({
    productCreate: { product: { id: P, handle: "fern" }, userErrors: [] },
  });
  handlers["GetProduct"] = () => productData([variantNode("11")]);
  handlers["UpdateVariants"] = () => ok("productVariantsBulkUpdate", { productVariants: [] });
  handlers["ChannelState"] = () => ({
    publications: { nodes: [{ id: "gid://shopify/Publication/1", name: "Online Store" }] },
    product: { resourcePublicationsV2: { nodes: [] } },
  });
  handlers["PublishProduct"] = () => ({ publishablePublish: { userErrors: [] } });
}

describe("who may do what", () => {
  it("refuses anonymous callers on every product and inventory endpoint", async () => {
    for (const call of [
      () => list(req("/api/admin/products", "GET")),
      () => create(req("/api/admin/products", "POST", undefined, body())),
      () => getOne(req("/api/admin/products/1", "GET")),
      () =>
        patchProduct(req("/api/admin/products/1", "PATCH", undefined, { product: { title: "x" } })),
      () => remove(req("/api/admin/products/1", "DELETE")),
      () => saveVariants(req("/api/admin/products/1/variants", "PUT", undefined, { variants: [] })),
      () => addImage(req("/api/admin/products/1/images", "POST", undefined, {})),
      () => collections(req("/api/admin/shop/collections", "GET")),
      () => locations(req("/api/admin/shop/locations", "GET")),
      () => lowStock(req("/api/admin/inventory", "GET")),
      () => adjust(req("/api/admin/inventory/adjust", "POST", undefined, {})),
      () => history(req("/api/admin/inventory/history", "GET")),
    ]) {
      expect((await call()).status).toBe(401);
    }
  });

  it("an editor (no product permissions) is refused", async () => {
    const { token } = await adminSession("ed@example.com", "editor");
    expect((await list(req("/api/admin/products", "GET", token))).status).toBe(403);
    expect((await lowStock(req("/api/admin/inventory", "GET", token))).status).toBe(403);
  });

  it("each permission opens exactly its own door", async () => {
    await Role.create({
      key: "viewer",
      name: "Viewer",
      permissions: ["products:read", "inventory:read"],
    });
    await Role.create({
      key: "merch",
      name: "Merch",
      permissions: ["products:read", "products:write"],
    });
    const viewer = await adminSession("v@example.com", "viewer");
    const merch = await adminSession("m@example.com", "merch");
    handlers["ListProducts"] = () => ({
      products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
    });
    handlers["GetProduct"] = () => productData([variantNode("11")]);
    handlers["UpdateProduct"] = () => ({
      productUpdate: { product: { id: P, handle: "fern" }, userErrors: [] },
    });
    handlers["DeleteProduct"] = () => ({ productDelete: { deletedProductId: P, userErrors: [] } });

    expect((await list(req("/api/admin/products", "GET", viewer.token))).status).toBe(200);
    expect(
      (
        await patchProduct(
          req("/api/admin/products/1", "PATCH", viewer.token, { product: { title: "x" } }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await adjust(
          req("/api/admin/inventory/adjust", "POST", viewer.token, {
            inventoryItemId: "gid://shopify/InventoryItem/1",
            locationId: "gid://shopify/Location/1",
            delta: 1,
          }),
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await patchProduct(
          req("/api/admin/products/1", "PATCH", merch.token, { product: { title: "x" } }),
        )
      ).status,
    ).toBe(200);
    // Archiving hides the product from the shop, so it needs the delete permission, as deleting does.
    const archive = await patchProduct(
      req("/api/admin/products/1", "PATCH", merch.token, { product: { status: "ARCHIVED" } }),
    );
    expect(archive.status).toBe(403);
    expect((await remove(req("/api/admin/products/1", "DELETE", merch.token))).status).toBe(403);
  });

  it("mutations need a same-origin request", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const evil = { origin: "https://evil.example" };
    expect((await create(req("/api/admin/products", "POST", token, body(), evil))).status).toBe(
      403,
    );
    expect(
      (await remove(req("/api/admin/products/1", "DELETE", token, undefined, evil))).status,
    ).toBe(403);
    expect((await adjust(req("/api/admin/inventory/adjust", "POST", token, {}, evil))).status).toBe(
      403,
    );
    expect(calls).toHaveLength(0);
  });
});

describe("products over HTTP", () => {
  it("creates a product, audits it, and returns the full detail", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    await setupProduct();
    const res = await create(
      req(
        "/api/admin/products",
        "POST",
        token,
        body({ product: { title: "Fern", status: "DRAFT", tags: ["a"] } }),
      ),
    );
    expect(res.status).toBe(201);
    expect((await json(res)).data.product).toMatchObject({ id: P, title: "Fern", currency: "USD" });
    const trail = JSON.stringify(
      await json(await audit(req("/api/admin/audit?limit=20", "GET", token))),
    );
    expect(trail).toContain("product.created");
  });

  it("lists, reads, edits, archives and deletes", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    handlers["ListProducts"] = () => ({
      products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
    });
    handlers["GetProduct"] = () => productData([variantNode("11")]);
    handlers["UpdateProduct"] = () => ({
      productUpdate: { product: { id: P, handle: "fern" }, userErrors: [] },
    });
    handlers["DeleteProduct"] = () => ({ productDelete: { deletedProductId: P, userErrors: [] } });

    expect(
      (await json(await list(req("/api/admin/products?search=fern&status=ACTIVE", "GET", token))))
        .data.items,
    ).toEqual([]);
    expect(
      (await json(await getOne(req("/api/admin/products/1", "GET", token)))).data.product.id,
    ).toBe(P);
    expect(
      (
        await patchProduct(
          req("/api/admin/products/1", "PATCH", token, {
            product: { title: "Fern 2", tags: ["x"] },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await patchProduct(
          req("/api/admin/products/1", "PATCH", token, { product: { status: "ARCHIVED" } }),
        )
      ).status,
    ).toBe(200);
    expect((await remove(req("/api/admin/products/1", "DELETE", token))).status).toBe(200);
    const trail = JSON.stringify(
      await json(await audit(req("/api/admin/audit?limit=50", "GET", token))),
    );
    for (const action of ["product.updated", "product.archived", "product.deleted"])
      expect(trail).toContain(action);
  });

  it("rejects bad input before anything reaches Shopify", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    for (const bad of [
      body({ product: { title: "  ", status: "DRAFT" } }),
      body({ variants: [{ optionValues: [], price: "ten" }] }),
      body({ variants: [{ optionValues: [], price: "1.999" }] }),
      body({ variants: [] }),
      body({ product: { title: "x", status: "WRONG" } }),
      body({ product: { title: "x", handle: "Not A Handle!" } }),
      body({ product: { title: "x", collectionIds: ["nope"] } }),
      body({ options: [{ name: "Size", values: ["S"] }] }),
      { nonsense: true },
      null,
    ]) {
      const res = await create(req("/api/admin/products", "POST", token, bad));
      expect(res.status, JSON.stringify(bad).slice(0, 60)).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("answers 404 for ids that aren't numeric, and limits request size", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    for (const id of ["abc", "1%20OR%201", "gid:%2F%2Fshopify%2FProduct%2F1"]) {
      expect((await getOne(req(`/api/admin/products/${id}`, "GET", token))).status, id).toBe(404);
    }
    const huge = body({
      product: { title: "x", status: "DRAFT", descriptionHtml: "y".repeat(300_000) },
    });
    expect((await create(req("/api/admin/products", "POST", token, huge))).status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it("passes Shopify's own refusal through as a 422, and an outage as a 503 without internals", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    handlers["CreateProduct"] = () => ({
      productCreate: {
        product: null,
        userErrors: [{ field: ["handle"], message: "Handle has already been taken" }],
      },
    });
    const refused = await create(req("/api/admin/products", "POST", token, body()));
    expect(refused.status).toBe(422);
    expect((await json(refused)).error).toMatchObject({
      code: "shopify_rejected",
      message: "Handle has already been taken",
    });

    handlers["CreateProduct"] = () =>
      new ShopifyError("Shopify Admin responded 502 shpat_secret", 502);
    const down = await create(req("/api/admin/products", "POST", token, body()));
    expect(down.status).toBe(503);
    expect(JSON.stringify(await json(down))).not.toMatch(/shpat|502/);
  });
});

describe("variants, options and images", () => {
  it("saves and removes variants, and manages options and images", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    handlers["GetProduct"] = () => productData([variantNode("11"), variantNode("12")]);
    handlers["UpdateVariants"] = () => ok("productVariantsBulkUpdate", { productVariants: [] });
    handlers["DeleteVariants"] = () => ok("productVariantsBulkDelete");
    handlers["AddOption"] = () => ok("productOptionsCreate");
    handlers["UpdateOption"] = () => ok("productOptionUpdate");
    handlers["DeleteOption"] = () => ok("productOptionsDelete");
    handlers["AddImages"] = () => ok("productUpdate");
    handlers["DeleteImages"] = () => ({ productDeleteMedia: { mediaUserErrors: [] } });
    handlers["ReorderImages"] = () => ({ productReorderMedia: { mediaUserErrors: [] } });

    const v = {
      id: "gid://shopify/ProductVariant/11",
      optionValues: ["Default Title"],
      price: "11.00",
      compareAtPrice: "15",
      costPerItem: "4",
      weight: { value: 1.5, unit: "KILOGRAMS" },
    };
    expect(
      (await saveVariants(req("/api/admin/products/1/variants", "PUT", token, { variants: [v] })))
        .status,
    ).toBe(200);
    const sent = (
      calls.find((c) => c.op === "UpdateVariants")?.variables["variants"] as Record<
        string,
        unknown
      >[]
    )[0];
    expect(sent).toMatchObject({
      price: "11.00",
      compareAtPrice: "15",
      inventoryItem: { cost: "4", measurement: { weight: { value: 1.5, unit: "KILOGRAMS" } } },
    });
    expect(
      (
        await removeVariant(
          req("/api/admin/products/1/variants", "DELETE", token, {
            variantIds: ["gid://shopify/ProductVariant/12"],
          }),
        )
      ).status,
    ).toBe(200);

    expect(
      (
        await addOption(
          req("/api/admin/products/1/options", "POST", token, {
            option: { name: "Pot", values: ["Clay"] },
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await patchOption(
          req("/api/admin/products/1/options", "PATCH", token, {
            optionId: "gid://shopify/ProductOption/1",
            name: "Height",
            addValues: ["Tall"],
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await deleteOption(
          req("/api/admin/products/1/options", "DELETE", token, {
            optionId: "gid://shopify/ProductOption/1",
          }),
        )
      ).status,
    ).toBe(200);

    expect(
      (
        await addImage(
          req("/api/admin/products/1/images", "POST", token, {
            images: [{ url: "https://cdn.shopify.com/a.png", alt: "A" }],
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await reorderImage(
          req("/api/admin/products/1/images", "PUT", token, {
            mediaIds: ["gid://shopify/MediaImage/2", "gid://shopify/MediaImage/1"],
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await removeImage(
          req("/api/admin/products/1/images", "DELETE", token, {
            mediaIds: ["gid://shopify/MediaImage/1"],
          }),
        )
      ).status,
    ).toBe(200);
  });

  it("refuses images from anywhere but the media library, bad variants and bad ids", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    for (const url of [
      "https://evil.example/a.png",
      "http://cdn.shopify.com/a.png",
      "javascript:alert(1)",
    ]) {
      expect(
        (
          await addImage(
            req("/api/admin/products/1/images", "POST", token, { images: [{ url, alt: "" }] }),
          )
        ).status,
        url,
      ).toBe(400);
    }
    expect(
      (
        await saveVariants(
          req("/api/admin/products/1/variants", "PUT", token, {
            variants: [{ optionValues: [], price: "-3" }],
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await removeVariant(
          req("/api/admin/products/1/variants", "DELETE", token, {
            variantIds: ["gid://shopify/Product/1"],
          }),
        )
      ).status,
    ).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe("sales channels over HTTP", () => {
  it("publishes a new product to the channels, and lets an admin change them (with permission and validation)", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    await setupProduct();
    await create(req("/api/admin/products", "POST", token, body()));
    expect(calls.map((c) => c.op)).toContain("PublishProduct");

    handlers["ChannelState"] = () => ({
      publications: {
        nodes: [
          { id: "gid://shopify/Publication/1", name: "Online Store" },
          { id: "gid://shopify/Publication/2", name: "Headless" },
        ],
      },
      product: {
        resourcePublicationsV2: {
          nodes: [{ isPublished: true, publication: { id: "gid://shopify/Publication/1" } }],
        },
      },
    });
    handlers["UnpublishProduct"] = () => ({ publishableUnpublish: { userErrors: [] } });
    const ok200 = await setChannels(
      req("/api/admin/products/1/channels", "PUT", token, {
        channelIds: ["gid://shopify/Publication/2"],
      }),
    );
    expect(ok200.status).toBe(200);
    expect(
      (
        await setChannels(
          req("/api/admin/products/1/channels", "PUT", token, { channelIds: ["nope"] }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await setChannels(
          req("/api/admin/products/1/channels", "PUT", token, {
            channelIds: ["gid://shopify/Publication/77"],
          }),
        )
      ).status,
    ).toBe(400);
    expect((await setChannels(req("/api/admin/products/1/channels", "PUT"))).status).toBe(401);
    const trail = JSON.stringify(
      await json(await audit(req("/api/admin/audit?limit=30", "GET", token))),
    );
    expect(trail).toContain("product.channels_changed");
  });
});

describe("collections, locations and inventory over HTTP", () => {
  it("lists collections and locations", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    handlers["anonymous"] = (v) => v;
    handlers["anonymous"] = () => ({
      collections: {
        nodes: [
          { id: "gid://shopify/Collection/1", title: "House Plants", ruleSet: null },
          {
            id: "gid://shopify/Collection/2",
            title: "Sale",
            ruleSet: { appliedDisjunctively: false },
          },
        ],
      },
      locations: { nodes: [{ id: "gid://shopify/Location/9", name: "Shop", isActive: true }] },
    });
    expect(
      (await json(await collections(req("/api/admin/shop/collections", "GET", token)))).data
        .collections,
    ).toEqual([
      { id: "gid://shopify/Collection/1", title: "House Plants", smart: false },
      { id: "gid://shopify/Collection/2", title: "Sale", smart: true },
    ]);
    expect(
      (await json(await locations(req("/api/admin/shop/locations", "GET", token)))).data.locations,
    ).toEqual([{ id: "gid://shopify/Location/9", name: "Shop", active: true }]);
  });

  it("adjusts stock, records it in the history and audit, and validates the request", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const item = "gid://shopify/InventoryItem/11";
    const loc = "gid://shopify/Location/9";
    handlers["ItemContext"] = () => ({
      inventoryItem: {
        id: item,
        tracked: true,
        variant: {
          id: "gid://shopify/ProductVariant/11",
          title: "Small",
          sku: "SKU",
          product: { id: P, title: "Fern" },
        },
      },
      location: { id: loc, name: "Shop" },
    });
    handlers["Adjust"] = () => ({
      inventoryAdjustQuantities: {
        inventoryAdjustmentGroup: {
          id: "gid://shopify/InventoryAdjustmentGroup/1",
          changes: [{ name: "available", quantityAfterChange: 9 }],
        },
        userErrors: [],
      },
    });
    const res = await adjust(
      req("/api/admin/inventory/adjust", "POST", token, {
        inventoryItemId: item,
        locationId: loc,
        delta: -3,
        reason: "damaged",
        note: "Frost",
      }),
    );
    expect(res.status).toBe(200);
    expect((await json(res)).data.quantityAfter).toBe(9);
    const hist = (await json(await history(req("/api/admin/inventory/history", "GET", token))))
      .data;
    expect(hist.items[0]).toMatchObject({
      delta: -3,
      reason: "damaged",
      note: "Frost",
      actorName: "Ada Admin",
      quantityAfter: 9,
      productTitle: "Fern",
    });
    expect(
      JSON.stringify(await json(await audit(req("/api/admin/audit?limit=20", "GET", token)))),
    ).toContain("inventory.adjusted");

    calls.length = 0;
    for (const bad of [
      { inventoryItemId: item, locationId: loc, delta: 0 },
      { inventoryItemId: item, locationId: loc, delta: 1.5 },
      { inventoryItemId: "nope", locationId: loc, delta: 1 },
      { inventoryItemId: item, locationId: loc, delta: 1, reason: "stolen" },
      { inventoryItemId: item, locationId: loc, delta: 10_000_000 },
    ]) {
      expect((await adjust(req("/api/admin/inventory/adjust", "POST", token, bad))).status).toBe(
        400,
      );
    }
    expect(calls).toHaveLength(0);
  });

  it("reads low stock and sold out, keeps the threshold, and starts stocking at a location", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    handlers["LowStock"] = () => ({
      productVariants: {
        pageInfo: { hasNextPage: true, endCursor: "NEXT" },
        nodes: [
          {
            id: "v1",
            title: "Small",
            sku: "S",
            inventoryQuantity: 2,
            product: { id: P, title: "Fern", featuredMedia: null },
            inventoryItem: { id: "gid://shopify/InventoryItem/11", tracked: true },
          },
        ],
      },
    });
    handlers["Activate"] = () => ok("inventoryActivate");

    expect(
      (await json(await getSettings(req("/api/admin/inventory/settings", "GET", token)))).data
        .lowStockThreshold,
    ).toBe(5);
    expect(
      (
        await putSettings(
          req("/api/admin/inventory/settings", "PUT", token, { lowStockThreshold: 9 }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await putSettings(
          req("/api/admin/inventory/settings", "PUT", token, { lowStockThreshold: -1 }),
        )
      ).status,
    ).toBe(400);
    const low = (await json(await lowStock(req("/api/admin/inventory", "GET", token)))).data;
    expect(low).toMatchObject({ threshold: 9, nextCursor: "NEXT" });
    expect(calls.at(-1)?.variables["query"]).toBe("inventory_quantity:<=9");
    await lowStock(req("/api/admin/inventory?soldOut=1", "GET", token));
    expect(calls.at(-1)?.variables["query"]).toBe("inventory_quantity:<=0");

    const started = await stock(
      req("/api/admin/inventory/stock", "POST", token, {
        inventoryItemId: "gid://shopify/InventoryItem/11",
        locationId: "gid://shopify/Location/9",
        available: 4,
      }),
    );
    expect(started.status).toBe(201);
  });
});
