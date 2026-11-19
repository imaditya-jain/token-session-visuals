// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/server/config/env";
import { disconnectDb } from "@/server/db/connection";
import { EmailJob } from "@/server/db/models/email-job";
import { Job } from "@/server/db/models/job";
import { RateLimit } from "@/server/db/models/rate-limit";
import { User } from "@/server/db/models/user";
import { registerUser, updateProfile } from "@/server/services/auth";
import { startTestDatabase } from "@/test/mongo";

import { drainDueJobs, processJob } from "./jobs";

const admin = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/shopify/admin", () => ({ adminQuery: admin.query }));

const meta = { ip: "198.51.100.60", userAgent: "vitest" };
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
  ]);
  admin.query.mockReset();
  vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "shpat_test_token_value");
  resetEnvCache();
});

const customer = (id = "gid://shopify/Customer/1") => ({ id, email: "ada@example.com" });
const created = (id?: string) => ({ customerCreate: { customer: customer(id), userErrors: [] } });
const updatedOk = { customerUpdate: { customer: customer(), userErrors: [] } };
const found = (nodes: object[]) => ({ customers: { nodes } });
const err = (message: string, field: string[] = ["email"]) => [{ field, message }];

const register = (email = "ada@example.com") =>
  registerUser(
    {
      email,
      password: "correct horse battery",
      firstName: "Ada",
      lastName: "Lovelace",
      acceptsMarketing: false,
    },
    meta,
  );
const onlyJob = async () => {
  const jobs = await Job.find({}).lean();
  expect(jobs).toHaveLength(1);
  return jobs[0]!;
};
const inputsOf = (name: "CustomerCreate" | "CustomerUpdate") =>
  admin.query.mock.calls
    .filter(([query]) => String(query).includes(`mutation ${name}`))
    .map(([, variables]) => (variables as { input: Record<string, unknown> }).input);

describe("queueing", () => {
  it("registration queues exactly one sync job holding only the user id", async () => {
    const { user } = await register();
    const job = await onlyJob();
    expect(job).toMatchObject({ type: "shopify.customer.sync", status: "pending", key: user.id });
    expect(job.payload).toEqual({ userId: user.id });
    expect(JSON.stringify(job)).not.toContain("ada@example.com");
  });

  it("queues nothing when Shopify Admin is not configured", async () => {
    vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "");
    resetEnvCache();
    await register();
    expect(await Job.countDocuments()).toBe(0);
  });

  it("repeated profile edits share one pending job", async () => {
    const { user } = await register();
    await updateProfile(user.id, { firstName: "Augusta" });
    await updateProfile(user.id, { lastName: "King" });
    expect(await Job.countDocuments({ status: "pending" })).toBe(1);
  });
});

describe("syncing", () => {
  it("creates a customer when none exists and records its id", async () => {
    const { user } = await register();
    admin.query
      .mockResolvedValueOnce(found([]))
      .mockResolvedValueOnce(created("gid://shopify/Customer/77"));
    const job = await onlyJob();
    expect(await processJob(job._id)).toBe("done");
    expect(
      await User.findById(user.id)
        .lean()
        .then((u) => u?.shopifyCustomerId),
    ).toBe("gid://shopify/Customer/77");
    expect(inputsOf("CustomerCreate")[0]).toEqual({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      tags: ["fernwood-web"],
    });
    expect((await Job.findById(job._id).lean())?.status).toBe("done");
  });

  it("links an existing guest customer instead of creating a duplicate (verified mailbox)", async () => {
    const { user } = await register();
    await User.updateOne({ _id: user.id }, { emailVerifiedAt: new Date() });
    admin.query
      .mockResolvedValueOnce(found([customer("gid://shopify/Customer/5")]))
      .mockResolvedValueOnce(updatedOk);
    await processJob((await onlyJob())._id);
    expect(inputsOf("CustomerCreate")).toHaveLength(0);
    expect(inputsOf("CustomerUpdate")[0]).toMatchObject({
      id: "gid://shopify/Customer/5",
      firstName: "Ada",
    });
    expect((await User.findById(user.id).lean())?.shopifyCustomerId).toBe(
      "gid://shopify/Customer/5",
    );
  });

  it("an unverified account leaves an existing customer untouched", async () => {
    const { user } = await register();
    admin.query.mockResolvedValueOnce(found([customer("gid://shopify/Customer/5")]));
    expect(await processJob((await onlyJob())._id)).toBe("done");
    expect(admin.query).toHaveBeenCalledTimes(1);
    expect(inputsOf("CustomerUpdate")).toHaveLength(0);
    expect(inputsOf("CustomerCreate")).toHaveLength(0);
    expect((await User.findById(user.id).lean())?.shopifyCustomerId).toBeUndefined();
  });

  it("updates in place once linked, without searching or touching tags", async () => {
    const { user } = await register();
    await User.updateOne({ _id: user.id }, { shopifyCustomerId: "gid://shopify/Customer/9" });
    admin.query.mockResolvedValueOnce(updatedOk);
    await processJob((await onlyJob())._id);
    expect(admin.query).toHaveBeenCalledTimes(1);
    expect(inputsOf("CustomerUpdate")[0]).toEqual({
      id: "gid://shopify/Customer/9",
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("recreates the customer when it was deleted in Shopify", async () => {
    const { user } = await register();
    await User.updateOne({ _id: user.id }, { shopifyCustomerId: "gid://shopify/Customer/gone" });
    admin.query
      .mockResolvedValueOnce({
        customerUpdate: { customer: null, userErrors: err("Customer does not exist", ["id"]) },
      })
      .mockResolvedValueOnce(found([]))
      .mockResolvedValueOnce(created("gid://shopify/Customer/88"));
    await processJob((await onlyJob())._id);
    expect((await User.findById(user.id).lean())?.shopifyCustomerId).toBe(
      "gid://shopify/Customer/88",
    );
  });

  it("falls back to lookup when creation loses a race on the email (verified mailbox)", async () => {
    const { user } = await register();
    await User.updateOne({ _id: user.id }, { emailVerifiedAt: new Date() });
    admin.query
      .mockResolvedValueOnce(found([]))
      .mockResolvedValueOnce({
        customerCreate: { customer: null, userErrors: err("Email has already been taken") },
      })
      .mockResolvedValueOnce(found([customer("gid://shopify/Customer/3")]));
    expect(await processJob((await onlyJob())._id)).toBe("done");
    expect((await User.findById(user.id).lean())?.shopifyCustomerId).toBe(
      "gid://shopify/Customer/3",
    );
  });

  it("does not adopt the customer that won the race when the mailbox is unverified", async () => {
    const { user } = await register();
    admin.query.mockResolvedValueOnce(found([])).mockResolvedValueOnce({
      customerCreate: { customer: null, userErrors: err("Email has already been taken") },
    });
    expect(await processJob((await onlyJob())._id)).toBe("done");
    expect(admin.query).toHaveBeenCalledTimes(2);
    expect((await User.findById(user.id).lean())?.shopifyCustomerId).toBeUndefined();
  });

  it("sends international phone numbers only, and retries without a phone Shopify refuses", async () => {
    const { user } = await register();
    await User.updateOne({ _id: user.id }, { phone: "+1 (503) 555-0142" });
    admin.query
      .mockResolvedValueOnce(found([]))
      .mockResolvedValueOnce({
        customerCreate: { customer: null, userErrors: err("Phone is invalid", ["phone"]) },
      })
      .mockResolvedValueOnce(created());
    expect(await processJob((await onlyJob())._id)).toBe("done");
    const [first, second] = inputsOf("CustomerCreate");
    expect(first?.["phone"]).toBe("+15035550142");
    expect(second).not.toHaveProperty("phone");
  });

  it("omits national-format phone numbers", async () => {
    const { user } = await register();
    await User.updateOne({ _id: user.id }, { phone: "(503) 555-0142" });
    admin.query.mockResolvedValueOnce(found([])).mockResolvedValueOnce(created());
    await processJob((await onlyJob())._id);
    expect(inputsOf("CustomerCreate")[0]).not.toHaveProperty("phone");
  });

  it("completes quietly when the account no longer exists", async () => {
    const { user } = await register();
    await User.deleteOne({ _id: user.id });
    expect(await processJob((await onlyJob())._id)).toBe("done");
    expect(admin.query).not.toHaveBeenCalled();
  });
});

describe("reliability", () => {
  it("retries with backoff, records the error, and eventually gives up", async () => {
    await register();
    admin.query.mockRejectedValue(new Error("Shopify Admin responded 503"));
    const job = await onlyJob();

    expect(await processJob(job._id)).toBe("retry");
    let state = (await Job.findById(job._id).lean())!;
    expect(state).toMatchObject({
      status: "pending",
      attempts: 1,
      lastError: "Shopify Admin responded 503",
    });
    expect(state.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(await processJob(job._id)).toBe("skipped");

    for (let attempt = 2; attempt <= 5; attempt++) {
      await Job.updateOne({ _id: job._id }, { runAt: new Date(Date.now() - 1000) });
      expect(await processJob(job._id)).toBe(attempt === 5 ? "failed" : "retry");
    }
    state = (await Job.findById(job._id).lean())!;
    expect(state).toMatchObject({ status: "failed", attempts: 5 });
    expect(state.expireAt).toBeInstanceOf(Date);
  });

  it("the sweeper runs due jobs and recovers one whose worker died", async () => {
    await register();
    admin.query.mockResolvedValueOnce(found([])).mockResolvedValueOnce(created());
    const job = await onlyJob();
    await Job.updateOne(
      { _id: job._id },
      { status: "processing", lockedUntil: new Date(Date.now() - 1000) },
    );
    expect(await drainDueJobs()).toEqual({ attempted: 1, done: 1 });
    expect((await Job.findById(job._id).lean())?.status).toBe("done");
  });

  it("two workers cannot run the same job", async () => {
    await register();
    admin.query.mockResolvedValue(found([customer()])).mockResolvedValue(updatedOk);
    const job = await onlyJob();
    const outcomes = await Promise.all([processJob(job._id), processJob(job._id)]);
    expect(outcomes.filter((o) => o === "skipped")).toHaveLength(1);
  });

  it("is idempotent: running the same sync again changes nothing new", async () => {
    const { user } = await register();
    admin.query
      .mockResolvedValueOnce(found([]))
      .mockResolvedValueOnce(created("gid://shopify/Customer/4"));
    await processJob((await onlyJob())._id);
    await updateProfile(user.id, { firstName: "Ada" });
    admin.query.mockResolvedValueOnce(updatedOk);
    const next = (await Job.findOne({ status: "pending" }).lean())!;
    await processJob(next._id);
    expect(inputsOf("CustomerCreate")).toHaveLength(1);
  });
});
