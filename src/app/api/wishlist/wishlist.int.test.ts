// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/server/config/env";
import { disconnectDb } from "@/server/db/connection";
import { RateLimit } from "@/server/db/models/rate-limit";
import { User } from "@/server/db/models/user";
import { Wishlist } from "@/server/db/models/wishlist";
import { registerUser } from "@/server/services/auth";
import { startTestDatabase } from "@/test/mongo";

import { GET as handles } from "./route";
import { DELETE, POST } from "./items/route";
import { GET as products } from "./products/route";

const catalog = vi.hoisted(() => {
  const make = (slug: string) => ({
    id: `gid://shopify/Product/${slug}`,
    slug,
    name: slug,
    category: "House Plants",
    price: 10,
    image: "/x.jpg",
    light: "Bright",
    size: "S",
    inStock: true,
    collectionSlugs: [],
  });
  const all = ["monstera", "zz-plant", "fern"].map(make);
  return {
    getProduct: vi.fn(async (handle: string) => all.find((p) => p.slug === handle)),
    getProducts: vi.fn(async () => all),
  };
});
vi.mock("@/data/catalog", () => catalog);

const ORIGIN = "http://localhost:3100";
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
  await Promise.all([User.deleteMany({}), Wishlist.deleteMany({}), RateLimit.deleteMany({})]);
});

const meta = { ip: "198.51.100.77", userAgent: "vitest" };
async function signUp(email: string) {
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

const call = (
  token: string | null,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  origin: string | null = ORIGIN,
) =>
  new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(origin ? { origin } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (response: Response): Promise<any> => response.json();

describe("wishlist API", () => {
  it("needs a signed-in customer", async () => {
    expect((await handles(call(null, "GET", "/api/wishlist"))).status).toBe(401);
    expect((await POST(call(null, "POST", "/api/wishlist/items", { handle: "fern" }))).status).toBe(
      401,
    );
    expect((await products(call(null, "GET", "/api/wishlist/products"))).status).toBe(401);
  });

  it("saves newest first, ignores duplicates and removes", async () => {
    const token = await signUp("ada@example.com");
    await POST(call(token, "POST", "/api/wishlist/items", { handle: "monstera" }));
    await POST(call(token, "POST", "/api/wishlist/items", { handle: "fern" }));
    const again = await POST(call(token, "POST", "/api/wishlist/items", { handle: "fern" }));
    expect((await json(again)).data.handles).toEqual(["fern", "monstera"]);

    const list = await json(await handles(call(token, "GET", "/api/wishlist")));
    expect(list.data.handles).toEqual(["fern", "monstera"]);

    const removed = await DELETE(call(token, "DELETE", "/api/wishlist/items", { handle: "fern" }));
    expect((await json(removed)).data.handles).toEqual(["monstera"]);
    const missing = await DELETE(
      call(token, "DELETE", "/api/wishlist/items", { handle: "zz-plant" }),
    );
    expect(missing.status).toBe(200);
  });

  it("returns live products in saved order and skips ones that left the catalogue", async () => {
    const token = await signUp("ada@example.com");
    await POST(call(token, "POST", "/api/wishlist/items", { handle: "monstera" }));
    await POST(call(token, "POST", "/api/wishlist/items", { handle: "zz-plant" }));
    await Wishlist.updateOne({}, { $push: { handles: "gone-from-shop" } });
    const body = await json(await products(call(token, "GET", "/api/wishlist/products")));
    expect(body.data.products.map((p: { slug: string }) => p.slug)).toEqual([
      "zz-plant",
      "monstera",
    ]);
  });

  it("rejects unknown products, malformed handles and extra fields", async () => {
    const token = await signUp("ada@example.com");
    const unknown = await POST(call(token, "POST", "/api/wishlist/items", { handle: "nope" }));
    expect(unknown.status).toBe(404);
    for (const bad of [
      { handle: "../etc" },
      { handle: { $ne: "" } },
      { handle: "fern", extra: 1 },
      {},
    ]) {
      const response = await POST(call(token, "POST", "/api/wishlist/items", bad));
      expect(response.status).toBe(400);
    }
  });

  it("refuses a request from another origin", async () => {
    const token = await signUp("ada@example.com");
    const response = await POST(
      call(token, "POST", "/api/wishlist/items", { handle: "fern" }, "https://evil.example"),
    );
    expect(response.status).toBe(403);
  });

  it("keeps every customer's list private", async () => {
    const ada = await signUp("ada@example.com");
    const bob = await signUp("bob@example.com");
    await POST(call(ada, "POST", "/api/wishlist/items", { handle: "fern" }));
    expect((await json(await handles(call(bob, "GET", "/api/wishlist")))).data.handles).toEqual([]);
  });

  it("stops at 100 saved plants", async () => {
    const token = await signUp("ada@example.com");
    const { Types } = await import("mongoose");
    const user = await User.findOne({}).lean();
    await Wishlist.create({
      userId: new Types.ObjectId(String(user?._id)),
      handles: Array.from({ length: 100 }, (_, i) => `plant-${i}`),
    });
    const response = await POST(call(token, "POST", "/api/wishlist/items", { handle: "fern" }));
    expect(response.status).toBe(409);
    expect((await json(response)).error.code).toBe("wishlist_full");
  });
});
