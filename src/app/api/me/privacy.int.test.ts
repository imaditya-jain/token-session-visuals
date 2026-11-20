// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/server/config/env";
import { disconnectDb } from "@/server/db/connection";
import { AuthToken } from "@/server/db/models/auth-token";
import { EmailJob } from "@/server/db/models/email-job";
import { Job } from "@/server/db/models/job";
import { RateLimit } from "@/server/db/models/rate-limit";
import { ShopifyOrder } from "@/server/db/models/shopify-mirror";
import { Subscriber } from "@/server/db/models/subscriber";
import { User } from "@/server/db/models/user";
import { processJob } from "@/server/queue/jobs";
import { authenticate, registerUser } from "@/server/services/auth";
import { issueAuthToken } from "@/server/services/auth-tokens";
import { startTestDatabase } from "@/test/mongo";

import { DELETE, GET as getMe } from "./route";
import { GET as exportData } from "./export/route";

const admin = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/shopify/admin", () => ({ adminQuery: admin.query }));

const ORIGIN = "http://localhost:3100";
const PASSWORD = "correct horse battery";
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
    Subscriber.deleteMany({}),
    ShopifyOrder.deleteMany({}),
    AuthToken.deleteMany({}),
    Job.deleteMany({}),
    EmailJob.deleteMany({}),
    RateLimit.deleteMany({}),
  ]);
  admin.query.mockReset();
  vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "shpat_test_token_value");
  resetEnvCache();
});

const meta = { ip: "198.51.100.90", userAgent: "Vitest/1.0" };
async function signUp(email = "ada@example.com") {
  const { user, accessToken } = await registerUser(
    { email, password: PASSWORD, firstName: "Ada", lastName: "Lovelace", acceptsMarketing: false },
    meta,
  );
  return { id: user.id, email, token: accessToken };
}

const GID = "gid://shopify/Customer/777";
let orderCounter = 1000;
async function seedAccountData(userId: string, email: string, withCustomer = true) {
  if (withCustomer)
    await User.updateOne({ _id: userId }, { shopifyCustomerId: GID, phone: "+15035550142" });
  await Subscriber.create({
    email,
    status: "subscribed",
    source: "footer",
    consentAt: new Date(),
    confirmedAt: new Date(),
  });
  await ShopifyOrder.create({
    gid: `gid://shopify/Order/${++orderCounter}`,
    shopifyUpdatedAt: new Date(),
    syncedAt: new Date(),
    name: "#1001",
    userId,
    customerGid: withCustomer ? GID : undefined,
    emailKey: "emailkey-hash",
    financialStatus: "PAID",
    fulfillmentStatus: "FULFILLED",
    currency: "USD",
    total: "48.00",
    processedAt: new Date(),
    lineItems: [{ gid: "gid://shopify/LineItem/1", title: "Monstera", quantity: 2 }],
  });
  await issueAuthToken(userId as never, "verify_email");
}

const req = (
  method: "GET" | "DELETE",
  path: string,
  {
    token,
    body,
    origin = ORIGIN,
    ip = "198.51.100.91",
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

describe("GET /api/me/export", () => {
  it("returns the person's own data in a portable file", async () => {
    const me = await signUp();
    await seedAccountData(me.id, me.email);
    const other = await signUp("eve@example.com");
    await seedAccountData(other.id, other.email, false);

    const response = await exportData(req("GET", "/api/me/export", { token: me.token }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("attachment");
    const { data } = await response.json();
    expect(data.schemaVersion).toBe(1);
    expect(data.account).toMatchObject({
      email: "ada@example.com",
      firstName: "Ada",
      phone: "+15035550142",
      shopifyCustomerId: GID,
    });
    expect(data.signedInDevices).toHaveLength(1);
    expect(data.signedInDevices[0]).toMatchObject({
      userAgent: "Vitest/1.0",
      ipAddress: "198.51.100.90",
    });
    expect(data.newsletter).toMatchObject({ status: "subscribed" });
    expect(data.orders).toHaveLength(1);
    expect(data.orders[0]).toMatchObject({
      name: "#1001",
      total: "48.00",
      items: [{ title: "Monstera", quantity: 2 }],
    });
    expect(data.notes.length).toBeGreaterThan(0);
  });

  it("never contains credentials, token hashes, or anyone else's data", async () => {
    const me = await signUp();
    await seedAccountData(me.id, me.email);
    const other = await signUp("eve@example.com");
    await seedAccountData(other.id, other.email, false);
    const stored = (await User.findById(me.id).select("+passwordHash +sessions").lean())!;

    const text = JSON.stringify(
      await (await exportData(req("GET", "/api/me/export", { token: me.token }))).json(),
    );
    expect(text).not.toContain(stored.passwordHash);
    expect(text).not.toMatch(/passwordHash|tokenHash|prevTokenHash|emailKey|eve@example\.com/);
    for (const session of stored.sessions) expect(text).not.toContain(session.tokenHash);
  });

  it("needs a valid session", async () => {
    expect((await exportData(req("GET", "/api/me/export"))).status).toBe(401);
    expect((await exportData(req("GET", "/api/me/export", { token: "garbage" }))).status).toBe(401);
  });

  it("is limited to 5 downloads an hour", async () => {
    const me = await signUp();
    for (let i = 0; i < 5; i++)
      expect((await exportData(req("GET", "/api/me/export", { token: me.token }))).status).toBe(
        200,
      );
    const limited = await exportData(req("GET", "/api/me/export", { token: me.token }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});

describe("DELETE /api/me", () => {
  it("deletes the account, signs everyone out, and cleans up around it", async () => {
    const me = await signUp();
    await seedAccountData(me.id, me.email);
    const other = await signUp("eve@example.com");
    await seedAccountData(other.id, other.email, false);

    const response = await DELETE(
      req("DELETE", "/api/me", { token: me.token, body: { password: PASSWORD } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { deleted: true } });
    expect(response.headers.get("set-cookie")?.toLowerCase()).toMatch(
      /max-age=0|expires=thu, 01 jan 1970/,
    );

    expect(await User.findById(me.id)).toBeNull();
    expect(await Subscriber.findOne({ email: me.email })).toBeNull();
    expect(await AuthToken.countDocuments({ userId: me.id })).toBe(0);

    // The order record stays (financial records are kept) but no longer points at the person.
    const order = (await ShopifyOrder.findOne({
      name: "#1001",
      total: "48.00",
      currency: "USD",
    }).lean())!;
    expect(await ShopifyOrder.countDocuments({ userId: me.id })).toBe(0);
    expect(order).toBeTruthy();
    expect(await ShopifyOrder.countDocuments({ customerGid: GID })).toBe(0);
    expect(
      await ShopifyOrder.countDocuments({ emailKey: "emailkey-hash", userId: { $exists: false } }),
    ).toBe(0);

    // Someone else's data is untouched.
    expect(await User.findById(other.id)).not.toBeNull();
    expect(await Subscriber.findOne({ email: other.email })).not.toBeNull();
    expect(await ShopifyOrder.countDocuments({ userId: other.id })).toBe(1);
  });

  it("the old access token stops working immediately", async () => {
    const me = await signUp();
    await DELETE(req("DELETE", "/api/me", { token: me.token, body: { password: PASSWORD } }));
    await expect(authenticate(`Bearer ${me.token}`)).rejects.toMatchObject({ status: 401 });
    expect((await getMe(req("GET", "/api/me", { token: me.token }))).status).toBe(401);
    expect(
      (await DELETE(req("DELETE", "/api/me", { token: me.token, body: { password: PASSWORD } })))
        .status,
    ).toBe(401);
  });

  it("queues the Shopify erasure with only the customer id, plus a confirmation email", async () => {
    const me = await signUp();
    await seedAccountData(me.id, me.email);
    await Job.deleteMany({});
    await DELETE(req("DELETE", "/api/me", { token: me.token, body: { password: PASSWORD } }));

    const jobs = await Job.find({ type: "shopify.customer.erase" }).lean();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toEqual({ customerGid: GID });
    expect(JSON.stringify(jobs[0])).not.toContain("ada@example.com");
    const mail = await EmailJob.findOne({ template: "account-deleted" }).lean();
    expect(mail).toMatchObject({ to: "ada@example.com" });
  });

  it("skips Shopify when the account never had a customer, but still confirms by email", async () => {
    const me = await signUp();
    await seedAccountData(me.id, me.email, false);
    await User.updateOne({ _id: me.id }, { $unset: { shopifyCustomerId: 1 } });
    await Job.deleteMany({});
    await DELETE(req("DELETE", "/api/me", { token: me.token, body: { password: PASSWORD } }));
    expect(await Job.countDocuments({ type: "shopify.customer.erase" })).toBe(0);
    expect(await EmailJob.countDocuments({ template: "account-deleted" })).toBe(1);
  });

  it("refuses a wrong password and changes nothing", async () => {
    const me = await signUp();
    await seedAccountData(me.id, me.email);
    await Job.deleteMany({});
    const response = await DELETE(
      req("DELETE", "/api/me", { token: me.token, body: { password: "not the password" } }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("invalid_password");
    expect(await User.findById(me.id)).not.toBeNull();
    expect(await Subscriber.findOne({ email: me.email })).not.toBeNull();
    expect(await ShopifyOrder.countDocuments({ userId: me.id })).toBe(1);
    expect(await Job.countDocuments()).toBe(0);
    expect(await EmailJob.countDocuments({ template: "account-deleted" })).toBe(0);
  });

  it.each([
    ["no body", undefined],
    ["empty password", { password: "" }],
    ["non-string password", { password: { $ne: "" } }],
    ["huge password", { password: "x".repeat(500) }],
  ])("rejects %s with 400 and keeps the account", async (_name, body) => {
    const me = await signUp();
    const response = await DELETE(
      req("DELETE", "/api/me", { token: me.token, ...(body !== undefined ? { body } : {}) }),
    );
    expect(response.status).toBe(400);
    expect(await User.findById(me.id)).not.toBeNull();
  });

  it("needs a session and a same-site request", async () => {
    const me = await signUp();
    expect((await DELETE(req("DELETE", "/api/me", { body: { password: PASSWORD } }))).status).toBe(
      401,
    );
    expect(
      (
        await DELETE(
          req("DELETE", "/api/me", {
            token: me.token,
            body: { password: PASSWORD },
            origin: "https://evil.example",
          }),
        )
      ).status,
    ).toBe(403);
    expect(await User.findById(me.id)).not.toBeNull();
  });

  it("limits password guessing to 5 attempts an hour", async () => {
    const me = await signUp();
    for (let i = 0; i < 5; i++)
      expect(
        (
          await DELETE(
            req("DELETE", "/api/me", { token: me.token, body: { password: `wrong-${i}` } }),
          )
        ).status,
      ).toBe(403);
    const limited = await DELETE(
      req("DELETE", "/api/me", { token: me.token, body: { password: PASSWORD } }),
    );
    expect(limited.status).toBe(429);
    expect(await User.findById(me.id)).not.toBeNull();
  });

  it("works for an account whose email was never verified", async () => {
    const me = await signUp();
    expect((await User.findById(me.id).lean())?.emailVerifiedAt).toBeUndefined();
    expect(
      (await DELETE(req("DELETE", "/api/me", { token: me.token, body: { password: PASSWORD } })))
        .status,
    ).toBe(200);
  });
});

describe("Shopify erasure job", () => {
  const erase = async () => {
    const me = await signUp();
    await seedAccountData(me.id, me.email);
    await DELETE(req("DELETE", "/api/me", { token: me.token, body: { password: PASSWORD } }));
    return (await Job.findOne({ type: "shopify.customer.erase" }).lean())!;
  };
  const reply = (userErrors: object[]) => ({
    customerRequestDataErasure: { customerId: GID, userErrors },
  });

  it("asks Shopify to erase the customer", async () => {
    const job = await erase();
    admin.query.mockResolvedValue(reply([]));
    expect(await processJob(job._id)).toBe("done");
    expect(admin.query.mock.calls[0]?.[1]).toEqual({ customerId: GID });
  });

  it("treats 'already requested' and 'does not exist' as done", async () => {
    for (const message of [
      "Customer data erasure has already been requested",
      "Customer does not exist",
    ]) {
      const job = await erase();
      admin.query.mockResolvedValue(reply([{ field: ["customerId"], message, code: null }]));
      expect(await processJob(job._id)).toBe("done");
      await Job.deleteMany({});
      await User.deleteMany({});
    }
  });

  it("retries on a real Shopify failure", async () => {
    const job = await erase();
    admin.query.mockResolvedValue(
      reply([{ field: null, message: "Something went wrong", code: "FAILED" }]),
    );
    expect(await processJob(job._id)).toBe("retry");
    expect((await Job.findById(job._id).lean())?.lastError).toContain("Something went wrong");
  });
});
