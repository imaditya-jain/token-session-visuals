// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { disconnectDb } from "@/server/db/connection";
import { RateLimit } from "@/server/db/models/rate-limit";
import { CART_COOKIE_NAME, createCartToken, readCartToken } from "@/server/cart/token";
import { startTestDatabase } from "@/test/mongo";

import { GET } from "./route";
import { DELETE, PATCH, POST } from "./lines/route";

const storefront = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/shopify/client", async (original) => ({
  ...(await original<typeof import("@/server/shopify/client")>()),
  storefrontQuery: storefront.query,
}));

vi.mock("@/data/catalog", () => ({ getProducts: async () => [] }));

const ORIGIN = "http://localhost:3100";
const CART_ID = "gid://shopify/Cart/abc123?key=k1";
const VARIANT = "gid://shopify/ProductVariant/1001";
const LINE = "gid://shopify/CartLine/line-1?cart=abc123";
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
  await RateLimit.deleteMany({});
  storefront.query.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const cartNode = (quantity = 1) => ({
  id: CART_ID,
  checkoutUrl: "https://shop.example/checkouts/cn/abc",
  totalQuantity: quantity,
  buyerIdentity: { email: null },
  cost: { subtotalAmount: { amount: "48.0", currencyCode: "USD" } },
  lines: {
    nodes: [
      {
        id: LINE,
        quantity,
        cost: { amountPerQuantity: { amount: "48.0" }, totalAmount: { amount: "48.0" } },
        sellingPlanAllocation: null,
        merchandise: {
          title: "Default Title",
          image: null,
          product: {
            handle: "monstera",
            title: "Monstera",
            featuredImage: { url: "https://cdn.shopify.com/a.jpg" },
          },
        },
      },
    ],
  },
});
const ok = (field: string, quantity = 1) => ({
  [field]: { cart: cartNode(quantity), userErrors: [] },
});

type Init = {
  method?: string;
  body?: unknown;
  cookie?: string;
  origin?: string | null;
  ip?: string;
};
const request = (
  path: string,
  { method = "GET", body, cookie, origin = ORIGIN, ip = "198.51.100.9" }: Init = {},
) =>
  new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(origin && method !== "GET" ? { origin } : {}),
      ...(cookie ? { cookie } : {}),
      "x-forwarded-for": ip,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
const cookieFor = (id = CART_ID) => `${CART_COOKIE_NAME}=${createCartToken(id)}`;

describe("cart token", () => {
  it("round-trips and rejects tampering", () => {
    const token = createCartToken(CART_ID);
    expect(readCartToken(token)).toBe(CART_ID);
    const [encoded, mac] = token.split(".");
    const forged = `${Buffer.from("gid://shopify/Cart/other").toString("base64url")}.${mac}`;
    expect(readCartToken(forged)).toBeNull();
    expect(readCartToken(`${encoded}.x${mac}`)).toBeNull();
    expect(readCartToken(undefined)).toBeNull();
    expect(readCartToken("garbage")).toBeNull();
  });
});

describe("GET /api/cart", () => {
  it("returns an empty cart without calling Shopify when there is no cookie", async () => {
    const response = await GET(request("/api/cart"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { cart: null } });
    expect(storefront.query).not.toHaveBeenCalled();
  });

  it("ignores a forged cookie", async () => {
    const response = await GET(request("/api/cart", { cookie: `${CART_COOKIE_NAME}=bogus.bogus` }));
    expect((await response.json()).data.cart).toBeNull();
    expect(storefront.query).not.toHaveBeenCalled();
  });

  it("maps the Shopify cart and refreshes the cookie", async () => {
    storefront.query.mockResolvedValue({ cart: cartNode(2) });
    const response = await GET(request("/api/cart", { cookie: cookieFor() }));
    const { data } = await response.json();
    expect(data.cart).toMatchObject({
      totalQuantity: 2,
      subtotal: { amount: "48.0", currency: "USD" },
      lines: [{ id: LINE, name: "Monstera", slug: "monstera", variantTitle: "" }],
    });
    expect(response.headers.get("set-cookie")).toContain(CART_COOKIE_NAME);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("starts fresh when Shopify no longer knows the cart", async () => {
    storefront.query.mockResolvedValue({ cart: null });
    const response = await GET(request("/api/cart", { cookie: cookieFor() }));
    expect((await response.json()).data.cart).toBeNull();
  });

  it("answers 503 when Shopify is down", async () => {
    storefront.query.mockRejectedValue(new Error("boom"));
    const response = await GET(request("/api/cart", { cookie: cookieFor() }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("cart_unavailable");
  });

  it("rate limits", async () => {
    for (let i = 0; i < 120; i++) await GET(request("/api/cart", { ip: "198.51.100.77" }));
    expect((await GET(request("/api/cart", { ip: "198.51.100.77" }))).status).toBe(429);
  });
});

describe("POST /api/cart/lines", () => {
  it("creates a cart and sets the signed cookie", async () => {
    storefront.query.mockResolvedValue(ok("cartCreate"));
    const response = await POST(
      request("/api/cart/lines", { method: "POST", body: { variantId: VARIANT } }),
    );
    expect(response.status).toBe(201);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${CART_COOKIE_NAME}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(storefront.query.mock.calls[0]?.[1]).toEqual({
      lines: [{ merchandiseId: VARIANT, quantity: 1 }],
    });
  });

  it("sends a subscription plan and the booking details as line attributes", async () => {
    storefront.query.mockResolvedValue(ok("cartCreate"));
    const response = await POST(
      request("/api/cart/lines", {
        method: "POST",
        body: {
          variantId: VARIANT,
          sellingPlanId: "gid://shopify/SellingPlan/6677430387",
          booking: {
            name: "Ada Lovelace",
            email: "ada@example.com",
            city: "Pune",
            address: "12 Garden Road, Baner",
            date: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
            phone: "+91 98765 43210",
            notes: "Gate code 1234",
          },
        },
      }),
    );
    expect(response.status).toBe(201);
    const line = (storefront.query.mock.calls[0]?.[1] as { lines: Record<string, unknown>[] })
      .lines[0];
    expect(line).toMatchObject({
      merchandiseId: VARIANT,
      sellingPlanId: "gid://shopify/SellingPlan/6677430387",
    });
    expect(line?.["attributes"]).toEqual([
      { key: "Name", value: "Ada Lovelace" },
      { key: "City", value: "Pune" },
      { key: "Address", value: "12 Garden Road, Baner" },
      { key: "Preferred date", value: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
      { key: "Phone", value: "+91 98765 43210" },
      { key: "Notes", value: "Gate code 1234" },
    ]);
  });

  it.each([
    ["a bad plan id", { sellingPlanId: "gid://shopify/Product/1" }],
    [
      "an unsupported city",
      {
        booking: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          city: "Delhi",
          address: "12 Garden Road",
          date: "2999-01-01",
          phone: "+91 98765 43210",
        },
      },
    ],
    [
      "a past date",
      {
        booking: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          city: "Pune",
          address: "12 Garden Road",
          date: "2001-01-01",
          phone: "+91 98765 43210",
        },
      },
    ],
    [
      "control characters in notes",
      {
        booking: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          city: "Pune",
          address: "12 Garden Road",
          date: "2999-01-01",
          phone: "+91 98765 43210",
          notes: "a\nb",
        },
      },
    ],
  ])("rejects %s", async (_label, extra) => {
    const response = await POST(
      request("/api/cart/lines", { method: "POST", body: { variantId: VARIANT, ...extra } }),
    );
    expect(response.status).toBe(400);
    expect(storefront.query).not.toHaveBeenCalled();
  });

  it("shows the subscription plan name where a variant title would be", async () => {
    const node = cartNode();
    node.lines.nodes[0]!.sellingPlanAllocation = {
      sellingPlan: { name: "Monthly garden visit" },
    } as never;
    storefront.query.mockResolvedValue({ cart: node });
    const response = await GET(request("/api/cart", { cookie: cookieFor() }));
    expect((await response.json()).data.cart.lines[0].variantTitle).toBe("Monthly garden visit");
  });

  it("adds to the existing cart", async () => {
    storefront.query
      .mockResolvedValueOnce({ cart: cartNode() })
      .mockResolvedValueOnce(ok("cartLinesAdd", 2));
    const response = await POST(
      request("/api/cart/lines", {
        method: "POST",
        body: { variantId: VARIANT, quantity: 2 },
        cookie: cookieFor(),
      }),
    );
    expect((await response.json()).data.cart.totalQuantity).toBe(2);
    expect(storefront.query.mock.calls[1]?.[1]).toMatchObject({ cartId: CART_ID });
  });

  it("creates a new cart when the old one expired", async () => {
    storefront.query.mockResolvedValueOnce({ cart: null }).mockResolvedValueOnce(ok("cartCreate"));
    const response = await POST(
      request("/api/cart/lines", {
        method: "POST",
        body: { variantId: VARIANT },
        cookie: cookieFor(),
      }),
    );
    expect(response.status).toBe(201);
  });

  it.each([
    ["not a gid", { variantId: "123" }],
    ["injection in variant", { variantId: `${VARIANT}") { x }` }],
    ["zero quantity", { variantId: VARIANT, quantity: 0 }],
    ["huge quantity", { variantId: VARIANT, quantity: 11 }],
    ["fractional quantity", { variantId: VARIANT, quantity: 1.5 }],
    ["string quantity", { variantId: VARIANT, quantity: "2" }],
    ["missing variant", {}],
  ])("rejects %s", async (_name, body) => {
    const response = await POST(request("/api/cart/lines", { method: "POST", body }));
    expect(response.status).toBe(400);
    expect(storefront.query).not.toHaveBeenCalled();
  });

  it("blocks cross-origin requests", async () => {
    const response = await POST(
      request("/api/cart/lines", {
        method: "POST",
        body: { variantId: VARIANT },
        origin: "https://evil.example",
      }),
    );
    expect(response.status).toBe(403);
    expect(storefront.query).not.toHaveBeenCalled();
  });

  it("requires a JSON content type", async () => {
    const bad = new NextRequest(`${ORIGIN}/api/cart/lines`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "text/plain" },
      body: "x",
    });
    expect((await POST(bad)).status).toBe(400);
  });

  it("maps stock errors to 409", async () => {
    storefront.query.mockResolvedValue({
      cartCreate: { cart: null, userErrors: [{ code: "MERCHANDISE_OUT_OF_STOCK", message: "x" }] },
    });
    const response = await POST(
      request("/api/cart/lines", { method: "POST", body: { variantId: VARIANT } }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("out_of_stock");
  });

  it("never leaks Shopify error text", async () => {
    storefront.query.mockResolvedValue({
      cartCreate: {
        cart: null,
        userErrors: [{ code: "WEIRD", message: "secret internal detail" }],
      },
    });
    const response = await POST(
      request("/api/cart/lines", { method: "POST", body: { variantId: VARIANT } }),
    );
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret internal detail");
  });
});

describe("PATCH/DELETE /api/cart/lines", () => {
  it("updates a quantity", async () => {
    storefront.query.mockResolvedValue(ok("cartLinesUpdate", 3));
    const response = await PATCH(
      request("/api/cart/lines", {
        method: "PATCH",
        body: { lineId: LINE, quantity: 3 },
        cookie: cookieFor(),
      }),
    );
    expect((await response.json()).data.cart.totalQuantity).toBe(3);
  });

  it("quantity 0 removes the line", async () => {
    storefront.query.mockResolvedValue(ok("cartLinesRemove", 0));
    const response = await PATCH(
      request("/api/cart/lines", {
        method: "PATCH",
        body: { lineId: LINE, quantity: 0 },
        cookie: cookieFor(),
      }),
    );
    expect(response.status).toBe(200);
    expect(storefront.query.mock.calls[0]?.[1]).toMatchObject({ lineIds: [LINE] });
  });

  it("removes a line", async () => {
    storefront.query.mockResolvedValue(ok("cartLinesRemove", 0));
    const response = await DELETE(
      request("/api/cart/lines", { method: "DELETE", body: { lineId: LINE }, cookie: cookieFor() }),
    );
    expect(response.status).toBe(200);
  });

  it("needs a cart cookie", async () => {
    const response = await PATCH(
      request("/api/cart/lines", { method: "PATCH", body: { lineId: LINE, quantity: 1 } }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("no_cart");
  });

  it("rejects malformed line ids and forged cookies", async () => {
    const bad = await DELETE(
      request("/api/cart/lines", { method: "DELETE", body: { lineId: "x" }, cookie: cookieFor() }),
    );
    expect(bad.status).toBe(400);
    const forged = await DELETE(
      request("/api/cart/lines", {
        method: "DELETE",
        body: { lineId: LINE },
        cookie: `${CART_COOKIE_NAME}=a.b`,
      }),
    );
    expect(forged.status).toBe(400);
    expect(storefront.query).not.toHaveBeenCalled();
  });

  it("rate limits writes", async () => {
    for (let i = 0; i < 60; i++)
      await PATCH(
        request("/api/cart/lines", {
          method: "PATCH",
          body: { lineId: LINE, quantity: 1 },
          ip: "198.51.100.88",
        }),
      );
    const response = await PATCH(
      request("/api/cart/lines", {
        method: "PATCH",
        body: { lineId: LINE, quantity: 1 },
        ip: "198.51.100.88",
      }),
    );
    expect(response.status).toBe(429);
  });
});
