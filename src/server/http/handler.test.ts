import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("@/server/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { AppError, tooManyRequests } from "./errors";
import { assertSameOrigin, clientIp, readJson, route } from "./handler";

const request = (
  init: ConstructorParameters<typeof NextRequest>[1] = {},
  url = "http://localhost:3000/api/x",
) => new NextRequest(url, init);

const failWith = (error: unknown) => route(async () => Promise.reject(error))(request());
const named = (name: string) =>
  Object.assign(new Error("boom: mongodb+srv://user:secret@cluster"), { name });

describe("route() error mapping", () => {
  it("maps AppError to its status, envelope and headers", async () => {
    const response = await failWith(tooManyRequests(42));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(await response.json()).toEqual({
      error: { code: "rate_limited", message: "Too many requests. Please try again later." },
    });
  });

  it("maps validation errors to 400 with field paths only", async () => {
    const result = z.object({ email: z.email() }).safeParse({ email: "nope" });
    const response = await failWith(result.error);
    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.code).toBe("validation_error");
    expect(error.fields).toEqual([expect.objectContaining({ path: "email" })]);
  });

  it.each([
    "MongooseServerSelectionError",
    "MongoServerSelectionError",
    "MongoNetworkError",
    "MongoNetworkTimeoutError",
  ])("reports a database outage (%s) as a retryable 503 without leaking details", async (name) => {
    const response = await failWith(named(name));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    const body = await response.json();
    expect(body.error.code).toBe("service_unavailable");
    expect(JSON.stringify(body)).not.toMatch(/mongo|secret|cluster/i);
  });

  it("turns unexpected errors into a generic 500 and never leaks the message or stack", async () => {
    const response = await failWith(new Error("SELECT * FROM users; password=hunter2"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: { code: "internal_error", message: "Something went wrong." } });
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("adds no-store and a request id to every response, honouring a caller-supplied id", async () => {
    const ok = await route(async () =>
      (await import("next/server")).NextResponse.json({ data: 1 }),
    )(request({ headers: { "x-request-id": "abc-123" } }));
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(ok.headers.get("x-request-id")).toBe("abc-123");
    expect(
      (await failWith(new AppError(418, "teapot", "x"))).headers.get("x-request-id"),
    ).toBeTruthy();
  });
});

describe("readJson()", () => {
  const schema = z.object({ a: z.number() });
  const post = (
    body: string,
    headers: Record<string, string> = { "content-type": "application/json" },
  ) => request({ method: "POST", headers, body });

  it("parses valid JSON and rejects wrong content types, bad JSON and oversized bodies", async () => {
    await expect(readJson(post('{"a":1}'), schema)).resolves.toEqual({ a: 1 });
    await expect(
      readJson(post("{}", { "content-type": "text/plain" }), schema),
    ).rejects.toMatchObject({ code: "unsupported_media_type" });
    await expect(readJson(post("{oops"), schema)).rejects.toMatchObject({ code: "invalid_json" });
    await expect(
      readJson(post(JSON.stringify({ a: 1, pad: "x".repeat(11_000) })), schema),
    ).rejects.toMatchObject({ status: 413 });
    await expect(readJson(post('{"a":"str"}'), schema)).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe("assertSameOrigin()", () => {
  it("allows the site's own origin and same-origin fetch metadata, blocks everything else", () => {
    expect(() =>
      assertSameOrigin(request({ headers: { origin: "http://localhost:3000" } })),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(request({ headers: { "sec-fetch-site": "same-origin" } })),
    ).not.toThrow();
    for (const headers of [
      { origin: "https://evil.example" },
      { origin: "null" },
      { "sec-fetch-site": "cross-site" },
      {},
    ]) {
      expect(() => assertSameOrigin(request({ headers }))).toThrowError(
        expect.objectContaining({ status: 403 }),
      );
    }
  });
});

describe("clientIp()", () => {
  it("uses the first X-Forwarded-For entry and bounds the value", () => {
    expect(clientIp(request({ headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } }))).toBe(
      "203.0.113.9",
    );
    expect(clientIp(request())).toBe("unknown");
    expect(clientIp(request({ headers: { "x-forwarded-for": "9".repeat(200) } })).length).toBe(64);
  });
});
