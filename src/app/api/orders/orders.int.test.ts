// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/server/config/env";
import { disconnectDb } from "@/server/db/connection";
import { RateLimit } from "@/server/db/models/rate-limit";
import { User } from "@/server/db/models/user";
import { registerUser } from "@/server/services/auth";
import { startTestDatabase } from "@/test/mongo";

import { GET as getOrderRoute } from "./[id]/route";
import { GET as listRoute } from "./route";

const ORIGIN = "http://localhost:3100";
const meta = { ip: "203.0.113.9", userAgent: "vitest" };
const OWNER = "ada@example.com";

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
  await User.deleteMany({});
  await RateLimit.deleteMany({});
});

afterEach(() => vi.restoreAllMocks());

const set = (amount: string) => ({ shopMoney: { amount, currencyCode: "USD" } });

const orderNode = (id: number, overrides: Record<string, unknown> = {}) => ({
  id: `gid://shopify/Order/${id}`,
  name: `#${id}`,
  email: OWNER,
  processedAt: "2026-11-01T10:00:00Z",
  createdAt: "2026-11-01T10:00:00Z",
  cancelledAt: null,
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "UNFULFILLED",
  currentTotalPriceSet: set("84.00"),
  currentSubtotalPriceSet: set("70.00"),
  totalShippingPriceSet: set("8.00"),
  currentTotalTaxSet: set("6.00"),
  lineItems: {
    nodes: [
      {
        title: "Monstera Deliciosa",
        quantity: 1,
        variantTitle: null,
        image: { url: "https://cdn.shopify.com/s/files/a.jpg" },
        originalUnitPriceSet: set("49.00"),
      },
      {
        title: "Brass Watering Can",
        quantity: 2,
        variantTitle: "Large",
        image: null,
        originalUnitPriceSet: set("10.50"),
      },
    ],
  },
  fulfillments: [
    { trackingInfo: [{ company: "USPS", number: "9400", url: "https://track.example/9400" }] },
  ],
  shippingAddress: { city: "Portland", province: "Oregon", country: "United States" },
  ...overrides,
});

const pageInfo = { hasNextPage: false, hasPreviousPage: false, startCursor: "s", endCursor: "e" };
const reply = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const variablesOf = (mock: { mock: { calls: unknown[][] } }, call = 0) =>
  JSON.parse(String((mock.mock.calls[call]![1] as RequestInit).body)).variables;

async function signUp(email = OWNER, verified = true) {
  const result = await registerUser(
    {
      email,
      password: "correct horse battery",
      firstName: "Ada",
      lastName: "Lovelace",
      acceptsMarketing: false,
    },
    meta,
  );
  if (verified) await User.updateOne({ email }, { emailVerifiedAt: new Date() });
  return result;
}

const req = (path: string, token?: string) =>
  new NextRequest(`${ORIGIN}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("GET /api/orders", () => {
  it("requires sign-in and a verified email", async () => {
    expect((await listRoute(req("/api/orders"))).status).toBe(401);

    const { accessToken } = await signUp(OWNER, false);
    const response = await listRoute(req("/api/orders", accessToken));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("email_unverified");
  });

  it("lists the owner's orders newest-first as customer-safe summaries, querying by their email only", async () => {
    const { accessToken } = await signUp();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        reply({ orders: { nodes: [orderNode(1002), orderNode(1001)], pageInfo } }),
      );

    const response = await listRoute(req("/api/orders", accessToken));
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.orders.map((o: { name: string }) => o.name)).toEqual(["#1002", "#1001"]);
    expect(data.orders[0]).toMatchObject({
      id: "1002",
      financialStatus: "PAID",
      fulfillmentStatus: "UNFULFILLED",
      total: { amount: "84.00", currency: "USD" },
      itemCount: 3,
      previewImages: ["https://cdn.shopify.com/s/files/a.jpg"],
    });
    expect(JSON.stringify(data)).not.toContain(OWNER); // no email echoed back

    expect(variablesOf(fetchMock)).toMatchObject({
      first: 10,
      last: null,
      query: `email:"${OWNER}"`,
    });
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Shopify-Access-Token"]).toBe("shpat_admin_token_for_tests");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).cache).toBe("no-store"); // customer data is never cached
  });

  it("drops any order whose email isn't exactly the owner's, even if the search returned it", async () => {
    const { accessToken } = await signUp();
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      reply({
        orders: {
          nodes: [
            orderNode(1),
            orderNode(2, { email: "someone.else@example.com" }),
            orderNode(3, { email: null }),
            orderNode(4, { email: "ADA@EXAMPLE.COM" }),
          ],
          pageInfo,
        },
      }),
    );
    const { data } = await (await listRoute(req("/api/orders", accessToken))).json();
    expect(data.orders.map((o: { id: string }) => o.id)).toEqual(["1", "4"]);
  });

  it("paginates with cursors in both directions and survives a malformed cursor", async () => {
    const { accessToken } = await signUp();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => reply({ orders: { nodes: [orderNode(1)], pageInfo } }));

    await listRoute(req("/api/orders?after=CUR1", accessToken));
    expect(variablesOf(fetchMock, 0)).toMatchObject({ first: 10, after: "CUR1", before: null });
    await listRoute(req("/api/orders?before=CUR2", accessToken));
    expect(variablesOf(fetchMock, 1)).toMatchObject({
      first: null,
      last: 10,
      before: "CUR2",
      after: null,
    });

    fetchMock
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ errors: [{ message: "Malformed cursor" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      )
      .mockImplementationOnce(async () => reply({ orders: { nodes: [orderNode(1)], pageInfo } }));
    const recovered = await listRoute(req("/api/orders?after=garbage", accessToken));
    expect(recovered.status).toBe(200);
    expect(variablesOf(fetchMock, 3)).toMatchObject({ after: null, before: null });
  });

  it("rejects oversized or malformed query parameters", async () => {
    const { accessToken } = await signUp();
    const response = await listRoute(req(`/api/orders?after=${"x".repeat(600)}`, accessToken));
    expect(response.status).toBe(400);
  });

  it("returns a friendly 503 (no internals) when Shopify fails", async () => {
    const { accessToken } = await signUp();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response("{}", { status: 500 }),
    );
    const response = await listRoute(req("/api/orders", accessToken));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("orders_unavailable");
    expect(JSON.stringify(body)).not.toMatch(/shopify|admin|500/i);
  });

  it("returns 503 when Admin credentials are not configured", async () => {
    const { accessToken } = await signUp();
    vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "");
    resetEnvCache();
    const response = await listRoute(req("/api/orders", accessToken));
    expect(response.status).toBe(503);
    vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "shpat_admin_token_for_tests");
    resetEnvCache();
  });
});

describe("GET /api/orders/[id]", () => {
  const call = (id: string, token?: string) => getOrderRoute(req(`/api/orders/${id}`, token));

  it("returns full detail with lines, totals, tracking and address", async () => {
    const { accessToken } = await signUp();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => reply({ order: orderNode(1001) }));
    const response = await call("1001", accessToken);
    expect(response.status).toBe(200);
    const { order } = (await response.json()).data;
    expect(order).toMatchObject({
      name: "#1001",
      subtotal: { amount: "70.00" },
      shipping: { amount: "8.00" },
      tax: { amount: "6.00" },
      total: { amount: "84.00" },
      tracking: [{ company: "USPS", number: "9400", url: "https://track.example/9400" }],
      shippingAddress: { city: "Portland", region: "Oregon", country: "United States" },
    });
    expect(order.lines).toEqual([
      {
        title: "Monstera Deliciosa",
        quantity: 1,
        image: "https://cdn.shopify.com/s/files/a.jpg",
        unitPrice: { amount: "49.00", currency: "USD" },
      },
      {
        title: "Brass Watering Can",
        variantTitle: "Large",
        quantity: 2,
        unitPrice: { amount: "10.50", currency: "USD" },
      },
    ]);
    expect(variablesOf(fetchMock)).toEqual({ id: "gid://shopify/Order/1001" });
  });

  it("answers 404 identically for a missing order and for someone else's order (no enumeration)", async () => {
    const { accessToken } = await signUp();
    const spy = vi.spyOn(globalThis, "fetch");
    spy.mockImplementationOnce(async () => reply({ order: null }));
    const missing = await call("999", accessToken);
    spy.mockImplementationOnce(async () =>
      reply({ order: orderNode(5, { email: "victim@example.com" }) }),
    );
    const foreign = await call("5", accessToken);

    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(await missing.json()).toEqual(await foreign.json());
  });

  it("never forwards a non-numeric id to Shopify", async () => {
    const { accessToken } = await signUp();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    for (const id of ["abc", "1%20OR%202", "gid%3A%2F%2Fshopify%2FOrder%2F1", "1".repeat(30)]) {
      expect((await call(id, accessToken)).status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires sign-in and a verified email", async () => {
    expect((await call("1")).status).toBe(401);
    const { accessToken } = await signUp(OWNER, false);
    expect((await call("1", accessToken)).status).toBe(403);
  });

  it("one customer cannot read another customer's order through their own session", async () => {
    await signUp("victim@example.com");
    const { accessToken } = await signUp("attacker@example.com");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      reply({ order: orderNode(7, { email: "victim@example.com" }) }),
    );
    expect((await call("7", accessToken)).status).toBe(404);
  });
});
