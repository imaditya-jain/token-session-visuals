// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/server/config/env";
import { disconnectDb } from "@/server/db/connection";
import { startTestDatabase } from "@/test/mongo";

import { GET as live } from "./route";
import { GET as ready } from "./ready/route";

const SECRET = "health-secret-for-tests-0123456789";
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
afterEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
});

const call = (handler: typeof ready, authorization?: string) =>
  handler(
    new NextRequest("http://localhost:3100/api/health/ready", {
      headers: authorization ? { authorization } : {},
    }),
  );

describe("GET /api/health (liveness)", () => {
  it("is public, minimal and never cached", async () => {
    const response = await live(new NextRequest("http://localhost:3100/api/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { status: "ok" } });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET /api/health/ready (readiness)", () => {
  it("reports every dependency when the secret is right", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const response = await call(ready, `Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.status).toBe("ok");
    expect(data.checks).toMatchObject({
      database: "ok",
      shopify_storefront: expect.stringMatching(/configured/),
      shopify_admin: expect.stringMatching(/configured/),
      email: expect.stringMatching(/configured/),
    });
  });

  it.each([
    ["no header", undefined],
    ["wrong secret", "Bearer nope"],
    ["wrong scheme", `Basic ${SECRET}`],
    ["empty bearer", "Bearer"],
  ])("refuses %s", async (_name, header) => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await call(ready, header)).status).toBe(403);
  });

  it("fails closed when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await call(ready, "Bearer anything");
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("not_configured");
  });

  it("answers 503 (degraded) when the database does not respond", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const { connectDb } = await import("@/server/db/connection");
    await connectDb();
    vi.spyOn(mongoose.connection.db!, "admin").mockReturnValue({
      ping: () => Promise.reject(new Error("connection lost")),
    } as never);
    const response = await call(ready, `Bearer ${SECRET}`);
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBeTruthy();
    const { data } = await response.json();
    expect(data).toMatchObject({ status: "degraded", checks: { database: "down" } });
    expect(JSON.stringify(data)).not.toContain("connection lost");
  });
});
