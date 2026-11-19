// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CART_COOKIE_NAME, createCartToken } from "@/server/cart/token";
import { disconnectDb } from "@/server/db/connection";
import { RateLimit } from "@/server/db/models/rate-limit";
import { User } from "@/server/db/models/user";
import { registerUser } from "@/server/services/auth";
import { startTestDatabase } from "@/test/mongo";

import { DELETE, PUT } from "./route";

const storefront = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/shopify/client", async (original) => ({
  ...(await original<typeof import("@/server/shopify/client")>()),
  storefrontQuery: storefront.query,
}));

const ORIGIN = "http://localhost:3100";
const CART_ID = "gid://shopify/Cart/abc123?key=k1";
const meta = { ip: "198.51.100.40", userAgent: "vitest" };
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
  await Promise.all([RateLimit.deleteMany({}), User.deleteMany({})]);
  storefront.query.mockReset();
});

const cartNode = (email: string | null) => ({
  id: CART_ID,
  checkoutUrl: `https://shop.example/checkouts/cn/${email ? "linked" : "plain"}`,
  totalQuantity: 1,
  buyerIdentity: { email },
  cost: { subtotalAmount: { amount: "48.0", currencyCode: "USD" } },
  lines: { nodes: [] },
});
const updated = (email: string | null) => ({
  cartBuyerIdentityUpdate: { cart: cartNode(email), userErrors: [] },
});

async function signUp(email = "ada@example.com") {
  const { accessToken } = await registerUser(
    {
      email,
      password: "correct horse battery",
      firstName: "Ada",
      lastName: "L",
      acceptsMarketing: false,
    },
    meta,
  );
  return accessToken;
}

type Init = { token?: string; cookie?: string | null; origin?: string | null; ip?: string };
const call = (
  method: "PUT" | "DELETE",
  {
    token,
    cookie = `${CART_COOKIE_NAME}=${createCartToken(CART_ID)}`,
    origin = ORIGIN,
    ip = "198.51.100.41",
  }: Init = {},
) =>
  new NextRequest(`${ORIGIN}/api/cart/identity`, {
    method,
    headers: {
      ...(origin ? { origin } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
      "x-forwarded-for": ip,
    },
  });

describe("PUT /api/cart/identity", () => {
  it("links the cart to the account email taken from the account, not the request", async () => {
    const token = await signUp("Ada@Example.com");
    storefront.query.mockResolvedValue(updated("ada@example.com"));
    const response = await PUT(call("PUT", { token }));
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.cart.identified).toBe(true);
    expect(JSON.stringify(data)).not.toContain("ada@example.com");
    expect(storefront.query.mock.calls[0]?.[1]).toEqual({
      cartId: CART_ID,
      email: "ada@example.com",
    });
    expect(response.headers.get("set-cookie")).toContain(CART_COOKIE_NAME);
  });

  it("requires a valid access token", async () => {
    expect((await PUT(call("PUT"))).status).toBe(401);
    expect((await PUT(call("PUT", { token: "garbage" }))).status).toBe(401);
    expect(storefront.query).not.toHaveBeenCalled();
  });

  it("blocks cross-origin requests", async () => {
    const token = await signUp();
    expect((await PUT(call("PUT", { token, origin: "https://evil.example" }))).status).toBe(403);
    expect(storefront.query).not.toHaveBeenCalled();
  });

  it("does nothing without a (valid) cart cookie", async () => {
    const token = await signUp();
    for (const cookie of [null, `${CART_COOKIE_NAME}=forged.value`]) {
      const response = await PUT(call("PUT", { token, cookie }));
      expect((await response.json()).data.cart).toBeNull();
    }
    expect(storefront.query).not.toHaveBeenCalled();
  });

  it("answers 503 when Shopify fails", async () => {
    const token = await signUp();
    storefront.query.mockRejectedValue(new Error("down"));
    expect((await PUT(call("PUT", { token }))).status).toBe(503);
  });

  it("rate limits per account", async () => {
    const token = await signUp();
    storefront.query.mockResolvedValue(updated("ada@example.com"));
    for (let i = 0; i < 30; i++) await PUT(call("PUT", { token }));
    expect((await PUT(call("PUT", { token }))).status).toBe(429);
  });
});

describe("DELETE /api/cart/identity", () => {
  it("clears the buyer email without needing a session (sign-out path)", async () => {
    storefront.query.mockResolvedValue(updated(null));
    const response = await DELETE(call("DELETE"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.cart.identified).toBe(false);
    expect(storefront.query.mock.calls[0]?.[1]).toEqual({ cartId: CART_ID, email: null });
  });

  it("ignores forged cookies and blocks cross-origin requests", async () => {
    expect(
      (await (await DELETE(call("DELETE", { cookie: `${CART_COOKIE_NAME}=a.b` }))).json()).data
        .cart,
    ).toBeNull();
    expect((await DELETE(call("DELETE", { origin: "https://evil.example" }))).status).toBe(403);
    expect(storefront.query).not.toHaveBeenCalled();
  });
});
