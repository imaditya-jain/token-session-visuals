// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/server/config/env";
import { disconnectDb } from "@/server/db/connection";
import { EmailJob } from "@/server/db/models/email-job";
import { Notification } from "@/server/db/models/notification";
import { RateLimit } from "@/server/db/models/rate-limit";
import { ShopifyOrder } from "@/server/db/models/shopify-mirror";
import { User } from "@/server/db/models/user";
import { registerUser } from "@/server/services/auth";
import { mirrorOne } from "@/server/services/shopify-mirror";
import { startTestDatabase } from "@/test/mongo";

import { GET as list } from "./route";
import { POST as markRead } from "./read/route";

const admin = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/shopify/admin", () => ({ adminQuery: admin.query }));

const ORIGIN = "http://localhost:3100";
const ORDER = "gid://shopify/Order/5001";
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
    Notification.deleteMany({}),
    ShopifyOrder.deleteMany({}),
    EmailJob.deleteMany({}),
    RateLimit.deleteMany({}),
  ]);
  admin.query.mockReset();
  vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "shpat_test_token_value");
  vi.stubEnv("ORDER_EMAIL_NOTIFICATIONS", "");
  resetEnvCache();
});
afterEach(() => vi.restoreAllMocks());

const meta = { ip: "198.51.100.95", userAgent: "vitest" };
async function signUp(email = "ada@example.com", verified = true) {
  const { user, accessToken } = await registerUser(
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
  return { id: user.id, email, token: accessToken };
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
let version = 0;
const node = (over: Record<string, unknown> = {}, email = "ada@example.com") => ({
  id: ORDER,
  name: "#1001",
  email,
  updatedAt: new Date(Date.UTC(2026, 5, 1, 0, 0, ++version)).toISOString(),
  processedAt: minutesAgo(2),
  cancelledAt: null,
  displayFinancialStatus: "PENDING",
  displayFulfillmentStatus: "UNFULFILLED",
  customer: null,
  currentTotalPriceSet: { shopMoney: { amount: "48.00", currencyCode: "USD" } },
  lineItems: { nodes: [] },
  ...over,
});
const sync = async (over: Record<string, unknown> = {}, email?: string) => {
  admin.query.mockResolvedValue({ order: node(over, email) });
  await mirrorOne("order", ORDER);
};
const kinds = async () =>
  (await Notification.find({}).sort({ createdAt: 1 }).lean()).map((n) => n.kind);

describe("order sync creates notifications", () => {
  it("announces a just-placed order once, even if the webhook is delivered twice", async () => {
    await signUp();
    await sync();
    await sync();
    expect(await kinds()).toEqual(["order.placed"]);
    const [n] = await Notification.find({}).lean();
    expect(n).toMatchObject({ title: "Order #1001 received", link: "/account/orders/5001" });
  });

  it("stays silent about history: an old order first seen by the backfill", async () => {
    await signUp();
    await sync({
      processedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      displayFinancialStatus: "PAID",
      displayFulfillmentStatus: "FULFILLED",
    });
    expect(await Notification.countDocuments()).toBe(0);
  });

  it("follows the order through payment, shipping and cancellation", async () => {
    await signUp();
    await sync();
    await sync({ displayFinancialStatus: "PAID" });
    await sync({ displayFinancialStatus: "PAID", displayFulfillmentStatus: "FULFILLED" });
    await sync({
      displayFinancialStatus: "PAID",
      displayFulfillmentStatus: "FULFILLED",
      cancelledAt: minutesAgo(1),
    });
    expect(await kinds()).toEqual([
      "order.placed",
      "order.paid",
      "order.shipped",
      "order.cancelled",
    ]);
  });

  it("ignores an older update that arrives after a newer one", async () => {
    await signUp();
    await sync();
    const newer = node({ displayFinancialStatus: "PAID", displayFulfillmentStatus: "FULFILLED" });
    const older = {
      ...node({ displayFinancialStatus: "PAID" }),
      updatedAt: new Date(Date.UTC(2026, 5, 1, 0, 0, 0)).toISOString(),
    };
    admin.query.mockResolvedValue({ order: newer });
    await mirrorOne("order", ORDER);
    admin.query.mockResolvedValue({ order: older });
    await mirrorOne("order", ORDER);
    expect(await kinds()).toEqual(["order.placed", "order.paid", "order.shipped"]);
  });

  it("notifies nobody for an order that belongs to no verified account", async () => {
    await signUp("ada@example.com", false);
    await sync();
    await sync({}, "stranger@example.com");
    expect(await Notification.countDocuments()).toBe(0);
  });

  it("never fails the order sync because a notification could not be saved", async () => {
    await signUp();
    vi.spyOn(Notification, "create").mockRejectedValue(new Error("database hiccup") as never);
    await expect(sync()).resolves.toBeUndefined();
    expect(await ShopifyOrder.countDocuments()).toBe(1);
  });
});

describe("branded order emails (opt-in)", () => {
  it("sends nothing while the switch is off (Shopify's own emails stay the only ones)", async () => {
    await signUp();
    await sync();
    await sync({ displayFulfillmentStatus: "FULFILLED" });
    expect(await EmailJob.countDocuments({ template: "order-update" })).toBe(0);
    expect(await Notification.countDocuments()).toBe(2);
  });

  it("sends received / shipped / cancelled (not 'paid') once the switch is on, without duplicates", async () => {
    vi.stubEnv("ORDER_EMAIL_NOTIFICATIONS", "true");
    resetEnvCache();
    await signUp();
    await sync();
    await sync();
    await sync({ displayFinancialStatus: "PAID" });
    await sync({ displayFinancialStatus: "PAID", displayFulfillmentStatus: "FULFILLED" });
    await sync({
      displayFinancialStatus: "PAID",
      displayFulfillmentStatus: "FULFILLED",
      cancelledAt: minutesAgo(1),
    });

    const mails = await EmailJob.find({ template: "order-update" }).lean();
    expect(mails.map((m) => m.dedupeKey).sort()).toEqual([
      `order-email:${ORDER}:order.cancelled`,
      `order-email:${ORDER}:order.placed`,
      `order-email:${ORDER}:order.shipped`,
    ]);
    expect(mails.every((m) => m.to === "ada@example.com")).toBe(true);
    expect(mails[0]?.data).toMatchObject({
      firstName: "Ada",
      orderName: "#1001",
      url: expect.stringContaining("/account/orders/5001"),
    });
  });
});

const req = (
  method: "GET" | "POST",
  path: string,
  {
    token,
    body,
    origin = ORIGIN,
    ip = "198.51.100.96",
  }: { token?: string; body?: unknown; origin?: string | null; ip?: string } = {},
) =>
  new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(origin && method !== "GET" ? { origin } : {}),
      "x-forwarded-for": ip,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const seed = async (userId: string, n: number, kind = "order.shipped" as const) => {
  for (let i = 0; i < n; i++)
    await Notification.create({
      userId,
      kind,
      title: `Order #${i} is on its way`,
      body: "Shipped.",
      link: `/account/orders/${i}`,
      dedupeKey: `${userId}:${i}`,
      createdAt: new Date(Date.UTC(2026, 5, 1, 0, 0, i)),
      expireAt: new Date(Date.now() + 86_400_000),
    });
};

describe("GET /api/notifications", () => {
  it("lists the caller's notifications newest first, with the unread count", async () => {
    const me = await signUp();
    const other = await signUp("eve@example.com");
    await seed(me.id, 3);
    await seed(other.id, 5);
    const { data } = await (
      await list(req("GET", "/api/notifications", { token: me.token }))
    ).json();
    expect(data.unreadCount).toBe(3);
    expect(data.items.map((i: { title: string }) => i.title)).toEqual([
      "Order #2 is on its way",
      "Order #1 is on its way",
      "Order #0 is on its way",
    ]);
    expect(data.items[0]).toMatchObject({ read: false, link: "/account/orders/2" });
    expect(JSON.stringify(data)).not.toMatch(/userId|dedupeKey/);
  });

  it("honours a limit and rejects a silly one", async () => {
    const me = await signUp();
    await seed(me.id, 8);
    expect(
      (await (await list(req("GET", "/api/notifications?limit=3", { token: me.token }))).json())
        .data.items,
    ).toHaveLength(3);
    for (const bad of ["0", "51", "abc", "-1"])
      expect(
        (await list(req("GET", `/api/notifications?limit=${bad}`, { token: me.token }))).status,
      ).toBe(400);
  });

  it("needs a valid session", async () => {
    expect((await list(req("GET", "/api/notifications"))).status).toBe(401);
    expect((await list(req("GET", "/api/notifications", { token: "garbage" }))).status).toBe(401);
  });
});

describe("POST /api/notifications/read", () => {
  it("marks chosen notifications read, and only the caller's own", async () => {
    const me = await signUp();
    const other = await signUp("eve@example.com");
    await seed(me.id, 3);
    await seed(other.id, 1);
    const mine = await Notification.find({ userId: me.id }).lean();
    const theirs = await Notification.findOne({ userId: other.id }).lean();

    const response = await markRead(
      req("POST", "/api/notifications/read", {
        token: me.token,
        body: { ids: [String(mine[0]!._id), String(theirs!._id)] },
      }),
    );
    expect((await response.json()).data.updated).toBe(1);
    expect((await Notification.findById(theirs!._id).lean())?.readAt).toBeUndefined();
    const { data } = await (
      await list(req("GET", "/api/notifications", { token: me.token }))
    ).json();
    expect(data.unreadCount).toBe(2);
  });

  it("can mark everything read, and a repeat changes nothing", async () => {
    const me = await signUp();
    await seed(me.id, 4);
    const first = await markRead(
      req("POST", "/api/notifications/read", { token: me.token, body: { all: true } }),
    );
    expect((await first.json()).data.updated).toBe(4);
    const again = await markRead(
      req("POST", "/api/notifications/read", { token: me.token, body: { all: true } }),
    );
    expect((await again.json()).data.updated).toBe(0);
  });

  it.each([
    ["no body", undefined],
    ["empty ids", { ids: [] }],
    ["too many ids", { ids: Array.from({ length: 51 }, () => "a".repeat(24)) }],
    ["malformed id", { ids: ["not-an-id"] }],
    ["operator object", { ids: [{ $ne: "" }] }],
    ["all that is not true", { all: "yes" }],
  ])("rejects %s with 400", async (_n, body) => {
    const me = await signUp();
    const response = await markRead(
      req("POST", "/api/notifications/read", {
        token: me.token,
        ...(body !== undefined ? { body } : {}),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("needs a session and a same-site request", async () => {
    const me = await signUp();
    expect(
      (await markRead(req("POST", "/api/notifications/read", { body: { all: true } }))).status,
    ).toBe(401);
    expect(
      (
        await markRead(
          req("POST", "/api/notifications/read", {
            token: me.token,
            body: { all: true },
            origin: "https://evil.example",
          }),
        )
      ).status,
    ).toBe(403);
  });
});
