// @vitest-environment node
import { createHmac } from "node:crypto";

import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag }));

import { resetEnvCache } from "@/server/config/env";
import { disconnectDb } from "@/server/db/connection";
import { Job } from "@/server/db/models/job";
import { startTestDatabase } from "@/test/mongo";

import { POST } from "./route";

const SECRET = "whsec_integration_secret";
let server: MongoMemoryServer;

beforeAll(async () => {
  server = await startTestDatabase();
  vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", SECRET);
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
  await Job.deleteMany({});
  revalidateTag.mockReset();
  vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "shpat_test_token_value");
  resetEnvCache();
});
afterEach(() => vi.restoreAllMocks());

const send = (payload: unknown, topic: string, secret = SECRET) => {
  const body = JSON.stringify(payload);
  return POST(
    new NextRequest("http://localhost:3000/api/webhooks/shopify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-topic": topic,
        "x-shopify-hmac-sha256": createHmac("sha256", secret).update(body, "utf8").digest("base64"),
      },
      body,
    }),
  );
};

describe("webhook → mirror queue", () => {
  it("queues a sync for the GID in a signed product update and still revalidates the cache", async () => {
    const response = await send(
      { admin_graphql_api_id: "gid://shopify/Product/7", handle: "monstera" },
      "products/update",
    );
    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalled();
    const job = await Job.findOne({}).lean();
    expect(job).toMatchObject({
      type: "shopify.mirror.sync",
      status: "pending",
      payload: { resource: "product", gid: "gid://shopify/Product/7" },
    });
  });

  it("queues order syncs and deletes with a GID built from the numeric id", async () => {
    await send({ admin_graphql_api_id: "gid://shopify/Order/9" }, "orders/paid");
    await send({ id: 42 }, "products/delete");
    const jobs = await Job.find({}).sort({ type: 1 }).lean();
    expect(jobs.map((j) => [j.type, j.payload])).toEqual([
      ["shopify.mirror.delete", { resource: "product", gid: "gid://shopify/Product/42" }],
      ["shopify.mirror.sync", { resource: "order", gid: "gid://shopify/Order/9" }],
    ]);
  });

  it("redelivery of the same webhook does not pile up jobs", async () => {
    for (let i = 0; i < 3; i++)
      await send({ admin_graphql_api_id: "gid://shopify/Product/7" }, "products/update");
    expect(await Job.countDocuments()).toBe(1);
  });

  it("rejects a bad signature without queueing anything", async () => {
    const response = await send(
      { admin_graphql_api_id: "gid://shopify/Product/7" },
      "products/update",
      "wrong-secret",
    );
    expect(response.status).toBe(401);
    expect(await Job.countDocuments()).toBe(0);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown topic", { admin_graphql_api_id: "gid://shopify/Product/7" }, "customers/update"],
    [
      "a GID of the wrong type for the topic",
      { admin_graphql_api_id: "gid://shopify/Order/9" },
      "products/update",
    ],
    ["a payload without a GID", { handle: "x" }, "products/update"],
  ])("acknowledges but queues nothing for %s", async (_name, payload, topic) => {
    expect((await send(payload, topic)).status).toBe(200);
    expect(await Job.countDocuments()).toBe(0);
  });

  it("acknowledges without queueing when Shopify Admin is not configured", async () => {
    vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "");
    resetEnvCache();
    expect(
      (await send({ admin_graphql_api_id: "gid://shopify/Product/7" }, "products/update")).status,
    ).toBe(200);
    expect(await Job.countDocuments()).toBe(0);
  });

  it("answers 503 (so Shopify redelivers) when our queue is unavailable", async () => {
    vi.spyOn(Job, "create").mockRejectedValueOnce(new Error("queue down") as never);
    const response = await send(
      { admin_graphql_api_id: "gid://shopify/Product/7" },
      "products/update",
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(JSON.stringify(await response.json())).not.toContain("queue down");
  });
});
