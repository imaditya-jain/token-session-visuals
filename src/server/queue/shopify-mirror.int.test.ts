// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/server/config/env";
import { disconnectDb } from "@/server/db/connection";
import { EmailJob } from "@/server/db/models/email-job";
import { Job } from "@/server/db/models/job";
import { RateLimit } from "@/server/db/models/rate-limit";
import { ShopifyCollection, ShopifyOrder, ShopifyProduct } from "@/server/db/models/shopify-mirror";
import { User } from "@/server/db/models/user";
import { registerUser } from "@/server/services/auth";
import { syncCustomer } from "@/server/services/customer-sync";
import {
  emailKey,
  linkOrdersToUser,
  markDeleted,
  mirrorOne,
} from "@/server/services/shopify-mirror";
import { startTestDatabase } from "@/test/mongo";

import { drainDueJobs } from "./jobs";
import { enqueueMirrorBackfill, enqueueMirrorSync } from "./producers";

const admin = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/shopify/admin", () => ({ adminQuery: admin.query }));

const meta = { ip: "198.51.100.80", userAgent: "vitest" };
let server: MongoMemoryServer;

beforeAll(async () => {
  server = await startTestDatabase();
}, 120_000);
afterAll(async () => {
  await disconnectDb();
  await server.stop();
  vi.unstubAllEnvs();
  resetEnvCache();
});
beforeEach(async () => {
  const { connectDb } = await import("@/server/db/connection");
  await connectDb();
  await Promise.all([
    User.deleteMany({}),
    Job.deleteMany({}),
    EmailJob.deleteMany({}),
    RateLimit.deleteMany({}),
    ShopifyProduct.deleteMany({}),
    ShopifyCollection.deleteMany({}),
    ShopifyOrder.deleteMany({}),
  ]);
  admin.query.mockReset();
  vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "shpat_test_token_value");
  resetEnvCache();
});

const P1 = "gid://shopify/Product/1";
const product = (over: Record<string, unknown> = {}) => ({
  id: P1,
  handle: "monstera",
  title: "Monstera",
  status: "ACTIVE",
  productType: "House Plants",
  tags: ["Bestseller"],
  updatedAt: "2026-01-02T00:00:00Z",
  variants: {
    nodes: [{ id: "gid://shopify/ProductVariant/11", sku: "MON-1", title: "Default Title" }],
  },
  collections: { nodes: [{ id: "gid://shopify/Collection/5" }] },
  ...over,
});
const orderNode = (over: Record<string, unknown> = {}) => ({
  id: "gid://shopify/Order/100",
  name: "#1001",
  email: "Ada@Example.com",
  updatedAt: "2026-02-01T00:00:00Z",
  processedAt: "2026-02-01T00:00:00Z",
  cancelledAt: null,
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "UNFULFILLED",
  customer: { id: "gid://shopify/Customer/9" },
  currentTotalPriceSet: { shopMoney: { amount: "48.00", currencyCode: "USD" } },
  lineItems: {
    nodes: [
      {
        id: "gid://shopify/LineItem/1",
        title: "Monstera",
        quantity: 2,
        product: { id: P1 },
        variant: { id: "gid://shopify/ProductVariant/11" },
      },
    ],
  },
  ...over,
});

const register = async (email = "ada@example.com", verified = true) => {
  const { user } = await registerUser(
    {
      email,
      password: "correct horse battery",
      firstName: "Ada",
      lastName: "L",
      acceptsMarketing: false,
    },
    meta,
  );
  if (verified) await User.updateOne({ _id: user.id }, { emailVerifiedAt: new Date() });
  await Job.deleteMany({});
  return user.id;
};

describe("products and collections", () => {
  it("stores the GIDs of the product, its variants and its collections", async () => {
    admin.query.mockResolvedValue({ product: product() });
    expect(await mirrorOne("product", P1)).toBe("synced");
    const saved = (await ShopifyProduct.findOne({ gid: P1 }).lean())!;
    expect(saved).toMatchObject({
      gid: P1,
      handle: "monstera",
      status: "ACTIVE",
      collectionGids: ["gid://shopify/Collection/5"],
      variants: [{ gid: "gid://shopify/ProductVariant/11", sku: "MON-1", title: "Default Title" }],
    });
    expect(saved.deletedAt).toBeUndefined();
  });

  it("is idempotent and updates in place", async () => {
    admin.query.mockResolvedValue({ product: product() });
    await mirrorOne("product", P1);
    admin.query.mockResolvedValue({
      product: product({ title: "Monstera XL", updatedAt: "2026-01-03T00:00:00Z" }),
    });
    await mirrorOne("product", P1);
    expect(await ShopifyProduct.countDocuments()).toBe(1);
    expect((await ShopifyProduct.findOne({ gid: P1 }).lean())?.title).toBe("Monstera XL");
  });

  it("never lets an older copy overwrite a newer one (out-of-order delivery)", async () => {
    admin.query.mockResolvedValue({
      product: product({ title: "Newest", updatedAt: "2026-03-01T00:00:00Z" }),
    });
    await mirrorOne("product", P1);
    admin.query.mockResolvedValue({
      product: product({ title: "Stale", updatedAt: "2026-01-01T00:00:00Z" }),
    });
    expect(await mirrorOne("product", P1)).toBe("synced");
    expect((await ShopifyProduct.findOne({ gid: P1 }).lean())?.title).toBe("Newest");
  });

  it("flags a record deleted in Shopify, keeps the row, and restores it if it returns", async () => {
    admin.query.mockResolvedValue({ product: product() });
    await mirrorOne("product", P1);
    admin.query.mockResolvedValue({ product: null });
    expect(await mirrorOne("product", P1)).toBe("deleted");
    expect((await ShopifyProduct.findOne({ gid: P1 }).lean())?.deletedAt).toBeInstanceOf(Date);
    admin.query.mockResolvedValue({ product: product({ updatedAt: "2026-04-01T00:00:00Z" }) });
    await mirrorOne("product", P1);
    expect((await ShopifyProduct.findOne({ gid: P1 }).lean())?.deletedAt).toBeUndefined();
  });

  it("deleting something we never held creates nothing", async () => {
    await markDeleted("product", "gid://shopify/Product/404");
    expect(await ShopifyProduct.countDocuments()).toBe(0);
  });

  it("stores collections", async () => {
    admin.query.mockResolvedValue({
      collection: {
        id: "gid://shopify/Collection/5",
        handle: "house-plants",
        title: "House Plants",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    });
    await mirrorOne("collection", "gid://shopify/Collection/5");
    expect(
      await ShopifyCollection.findOne({ gid: "gid://shopify/Collection/5" }).lean(),
    ).toMatchObject({
      handle: "house-plants",
      title: "House Plants",
    });
  });
});

describe("orders", () => {
  it("stores order, line-item, product and variant GIDs without any email, address or phone", async () => {
    admin.query.mockResolvedValue({ order: orderNode() });
    await mirrorOne("order", "gid://shopify/Order/100");
    const saved = (await ShopifyOrder.findOne({ gid: "gid://shopify/Order/100" }).lean())!;
    expect(saved).toMatchObject({
      name: "#1001",
      customerGid: "gid://shopify/Customer/9",
      financialStatus: "PAID",
      fulfillmentStatus: "UNFULFILLED",
      currency: "USD",
      total: "48.00",
      lineItems: [
        {
          gid: "gid://shopify/LineItem/1",
          quantity: 2,
          productGid: P1,
          variantGid: "gid://shopify/ProductVariant/11",
        },
      ],
    });
    expect(saved.emailKey).toBe(emailKey("ada@example.com"));
    expect(JSON.stringify(saved).toLowerCase()).not.toContain("ada@example.com");
  });

  it("links the order to the account that owns the (verified) email", async () => {
    const userId = await register("ada@example.com", true);
    admin.query.mockResolvedValue({ order: orderNode({ customer: null }) });
    await mirrorOne("order", "gid://shopify/Order/100");
    expect(String((await ShopifyOrder.findOne({}).lean())?.userId)).toBe(userId);
  });

  it("does not link an order to an account whose email is unverified", async () => {
    await register("ada@example.com", false);
    admin.query.mockResolvedValue({ order: orderNode() });
    await mirrorOne("order", "gid://shopify/Order/100");
    expect((await ShopifyOrder.findOne({}).lean())?.userId).toBeUndefined();
  });

  it("claims earlier guest orders once the account is verified", async () => {
    const userId = await register("ada@example.com", false);
    admin.query.mockResolvedValue({ order: orderNode({ customer: null }) });
    await mirrorOne("order", "gid://shopify/Order/100");

    const unverified = (await User.findById(userId).lean())!;
    await linkOrdersToUser(unverified);
    expect((await ShopifyOrder.findOne({}).lean())?.userId).toBeUndefined();

    await User.updateOne({ _id: userId }, { emailVerifiedAt: new Date() });
    await linkOrdersToUser((await User.findById(userId).lean())!);
    expect(String((await ShopifyOrder.findOne({}).lean())?.userId)).toBe(userId);
  });

  it("never steals an order that already belongs to someone else", async () => {
    const owner = await register("ada@example.com", true);
    admin.query.mockResolvedValue({ order: orderNode() });
    await mirrorOne("order", "gid://shopify/Order/100");
    const other = await register("eve@example.com", true);
    await User.updateOne({ _id: other }, { shopifyCustomerId: "gid://shopify/Customer/9" });
    await linkOrdersToUser((await User.findById(other).lean())!);
    expect(String((await ShopifyOrder.findOne({}).lean())?.userId)).toBe(owner);
  });

  it("keeps cancellation and status changes", async () => {
    admin.query.mockResolvedValue({ order: orderNode() });
    await mirrorOne("order", "gid://shopify/Order/100");
    admin.query.mockResolvedValue({
      order: orderNode({
        cancelledAt: "2026-02-05T00:00:00Z",
        updatedAt: "2026-02-05T00:00:00Z",
        displayFinancialStatus: "REFUNDED",
      }),
    });
    await mirrorOne("order", "gid://shopify/Order/100");
    expect(await ShopifyOrder.findOne({}).lean()).toMatchObject({ financialStatus: "REFUNDED" });
    expect((await ShopifyOrder.findOne({}).lean())?.cancelledAt).toBeInstanceOf(Date);
  });
});

describe("customers", () => {
  const customerReply = (id: string) => ({
    customerCreate: { customer: { id, email: "ada@example.com" }, userErrors: [] },
  });

  it("an unverified account never adopts or rewrites an existing Shopify customer", async () => {
    const userId = await register("ada@example.com", false);
    admin.query.mockResolvedValueOnce({
      customers: { nodes: [{ id: "gid://shopify/Customer/7", email: "ada@example.com" }] },
    });
    await syncCustomer(userId);
    expect(admin.query).toHaveBeenCalledTimes(1); // the lookup only: no update, no create
    expect((await User.findById(userId).lean())?.shopifyCustomerId).toBeUndefined();
  });

  it("an unverified account with no existing customer still gets one created", async () => {
    const userId = await register("ada@example.com", false);
    admin.query
      .mockResolvedValueOnce({ customers: { nodes: [] } })
      .mockResolvedValueOnce(customerReply("gid://shopify/Customer/8"));
    await syncCustomer(userId);
    expect((await User.findById(userId).lean())?.shopifyCustomerId).toBe(
      "gid://shopify/Customer/8",
    );
  });

  it("once verified, the account adopts the existing customer and claims its orders", async () => {
    const userId = await register("ada@example.com", true);
    admin.query.mockResolvedValue({ order: orderNode({ customer: null }) });
    await mirrorOne("order", "gid://shopify/Order/100");
    await ShopifyOrder.updateOne({}, { $unset: { userId: 1 } });

    admin.query.mockReset();
    admin.query
      .mockResolvedValueOnce({
        customers: { nodes: [{ id: "gid://shopify/Customer/7", email: "ada@example.com" }] },
      })
      .mockResolvedValueOnce({
        customerUpdate: {
          customer: { id: "gid://shopify/Customer/7", email: null },
          userErrors: [],
        },
      });
    await syncCustomer(userId);
    expect((await User.findById(userId).lean())?.shopifyCustomerId).toBe(
      "gid://shopify/Customer/7",
    );
    expect(String((await ShopifyOrder.findOne({}).lean())?.userId)).toBe(userId);
  });

  it("verifying the email queues a sync (so a proven mailbox can adopt its customer)", async () => {
    const { confirmEmailVerification } = await import("@/server/services/auth");
    const { issueAuthToken } = await import("@/server/services/auth-tokens");
    const userId = await register("ada@example.com", false);
    const token = await issueAuthToken(userId as never, "verify_email");
    await confirmEmailVerification(token);
    expect(await Job.countDocuments({ type: "shopify.customer.sync", key: userId })).toBe(1);
  });
});

describe("queueing and backfill", () => {
  it("webhook syncs dedupe while pending and do nothing without Shopify Admin", async () => {
    expect(await enqueueMirrorSync("sync", "product", P1)).toBe(true);
    await enqueueMirrorSync("sync", "product", P1);
    expect(await Job.countDocuments({ type: "shopify.mirror.sync" })).toBe(1);

    vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "");
    resetEnvCache();
    expect(await enqueueMirrorSync("sync", "product", "gid://shopify/Product/2")).toBe(false);
  });

  it("rejects a GID that does not match its resource", async () => {
    await expect(enqueueMirrorSync("sync", "order", P1)).rejects.toThrow();
  });

  it("backfill walks every page of every resource via chained jobs", async () => {
    const page = (nodes: unknown[], next: string | null) => ({
      nodes,
      pageInfo: { hasNextPage: next !== null, endCursor: next },
    });
    admin.query.mockImplementation(async (query: string, variables: { after?: string }) => {
      if (query.includes("query MirrorProducts")) {
        return variables.after
          ? { products: page([product({ id: "gid://shopify/Product/2", handle: "snake" })], null) }
          : { products: page([product()], "CUR1") };
      }
      if (query.includes("query MirrorCollections"))
        return {
          collections: page(
            [
              {
                id: "gid://shopify/Collection/5",
                handle: "a",
                title: "A",
                updatedAt: "2026-01-01T00:00:00Z",
              },
            ],
            null,
          ),
        };
      if (query.includes("query MirrorOrders")) return { orders: page([orderNode()], null) };
      throw new Error(`unexpected query ${query.slice(0, 40)}`);
    });

    await enqueueMirrorBackfill();
    for (let round = 0; round < 6; round++) await drainDueJobs();

    expect(await ShopifyProduct.countDocuments()).toBe(2);
    expect(await ShopifyCollection.countDocuments()).toBe(1);
    expect(await ShopifyOrder.countDocuments()).toBe(1);
    expect(await Job.countDocuments({ status: { $ne: "done" } })).toBe(0);
    // Running it again changes nothing (idempotent safety net).
    await enqueueMirrorBackfill();
    for (let round = 0; round < 6; round++) await drainDueJobs();
    expect(await ShopifyProduct.countDocuments()).toBe(2);
  });
});
