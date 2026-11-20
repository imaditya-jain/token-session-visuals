import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { scrubEvent } from "./sentry-scrub";

const event = (over: Partial<ErrorEvent> = {}): ErrorEvent => ({
  type: undefined,
  message: "Login failed for ada@example.com",
  exception: { values: [{ type: "Error", value: "Order for grace.hopper@navy.mil not found" }] },
  user: { id: "u1", email: "ada@example.com", ip_address: "203.0.113.7" },
  request: {
    url: "https://fernwood.example/api/me?token=abc",
    query_string: "token=abc",
    cookies: { fw_rt: "refresh-token" },
    data: { password: "hunter2" },
    headers: {
      Authorization: "Bearer secret",
      Cookie: "fw_rt=refresh-token",
      "X-Forwarded-For": "203.0.113.7",
      "User-Agent": "Mozilla/5.0",
    },
  },
  ...over,
});

describe("scrubEvent", () => {
  it("removes credentials, cookies, bodies, query strings, IPs and the user", () => {
    const result = scrubEvent(event());
    expect(result.user).toBeUndefined();
    expect(result.request?.cookies).toBeUndefined();
    expect(result.request?.data).toBeUndefined();
    expect(result.request?.query_string).toBeUndefined();
    expect(Object.keys(result.request?.headers ?? {})).toEqual(["User-Agent"]);
  });

  it("masks email addresses in messages and exception text", () => {
    const result = scrubEvent(event());
    expect(result.message).toBe("Login failed for [email]");
    expect(result.exception?.values?.[0]?.value).toBe("Order for [email] not found");
  });

  it("keeps what is needed to debug: the stack, the route and the harmless headers", () => {
    const result = scrubEvent(
      event({
        exception: {
          values: [
            {
              type: "TypeError",
              value: "x is undefined",
              stacktrace: { frames: [{ filename: "a.ts", lineno: 3 }] },
            },
          ],
        },
      }),
    );
    expect(result.exception?.values?.[0]).toMatchObject({
      type: "TypeError",
      stacktrace: { frames: [{ lineno: 3 }] },
    });
    expect(result.request?.url).toBe("https://fernwood.example/api/me");
  });

  it("never reports one-time tokens carried in URLs, including navigation breadcrumbs", () => {
    const result = scrubEvent(
      event({
        request: { url: "https://fernwood.example/reset-password?token=SECRETTOKEN#frag" },
        breadcrumbs: [
          { category: "navigation", data: { from: "/verify-email?token=T1", to: "/account?x=1" } },
          {
            category: "fetch",
            data: { url: "/api/orders?after=CURSOR", method: "GET" },
            message: "ada@example.com",
          },
        ],
      }),
    );
    expect(result.request?.url).toBe("https://fernwood.example/reset-password");
    expect(result.breadcrumbs?.[0]?.data).toEqual({ from: "/verify-email", to: "/account" });
    expect(result.breadcrumbs?.[1]?.data).toMatchObject({ url: "/api/orders", method: "GET" });
    expect(result.breadcrumbs?.[1]?.message).toBe("[email]");
    expect(JSON.stringify(result)).not.toMatch(/SECRETTOKEN|T1|CURSOR/);
  });

  it("tolerates events without a request or user", () => {
    expect(() => scrubEvent({ type: undefined, message: "plain" })).not.toThrow();
  });
});
