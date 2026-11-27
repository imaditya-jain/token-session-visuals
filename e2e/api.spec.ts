import { createHmac } from "node:crypto";

import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";

import { latestEmailLink, latestOtpCode, runtime } from "./helpers/mailbox";

/**
 * Black-box contract tests for every HTTP endpoint, against the real running server (production build,
 * in-memory MongoDB, no Shopify). Each test uses a fresh client IP because the rate limiter keys on it.
 */
const password = "correct-horse-battery";
const randomIp = () =>
  `100.64.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
const uniqueEmail = (tag = "api") =>
  `${tag}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

// Same source as playwright.config.ts.
const baseURL = process.env["BASE_URL"] ?? "http://localhost:3100";
const clients: APIRequestContext[] = [];

async function client(
  options: { ip?: string; origin?: string | null } = {},
): Promise<APIRequestContext> {
  const origin = options.origin === undefined ? baseURL : options.origin;
  const api = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: {
      "x-forwarded-for": options.ip ?? randomIp(),
      ...(origin ? { origin } : {}),
    },
  });
  clients.push(api);
  return api;
}

test.afterEach(async () => {
  await Promise.all(clients.splice(0).map((api) => api.dispose()));
});

const json = (
  api: APIRequestContext,
  path: string,
  data: unknown,
  method = "post",
  headers: Record<string, string> = {},
) =>
  api.fetch(path, {
    method,
    data: JSON.stringify(data),
    headers: { "content-type": "application/json", ...headers },
  });

const body = async (response: APIResponse) =>
  (await response.text()) ? JSON.parse(await response.text()) : null;
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function signUp(api: APIRequestContext, email = uniqueEmail()) {
  const response = await json(api, "/api/auth/register", {
    email,
    password,
    firstName: "Ada",
    lastName: "Lovelace",
  });
  expect(response.status()).toBe(201);
  const { data } = await body(response);
  return { email, token: data.accessToken as string, userId: data.user.id as string };
}

async function verify(api: APIRequestContext, email: string) {
  const url = new URL(await latestEmailLink("verify-email", email));
  const response = await json(api, "/api/auth/verify-email/confirm", {
    token: url.searchParams.get("token"),
  });
  expect(response.status()).toBe(200);
}

test.describe("security headers", () => {
  for (const path of ["/", "/shop", "/login", "/api/me", "/api/does-not-exist"]) {
    test(`${path} carries the baseline headers and hides the framework`, async () => {
      const response = await (await client()).get(path, { failOnStatusCode: false });
      const headers = response.headers();
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["permissions-policy"]).toContain("camera=()");
      expect(headers["strict-transport-security"]).toContain("max-age=");
      expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
      expect(headers["x-powered-by"]).toBeUndefined();
    });

    test(`${path} carries a locked-down Content-Security-Policy`, async () => {
      const response = await (await client()).get(path, { failOnStatusCode: false });
      const csp = response.headers()["content-security-policy"] ?? "";
      for (const directive of [
        "default-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "connect-src 'self'",
        "img-src 'self' data: blob:",
      ])
        expect(csp).toContain(directive);
      expect(csp).not.toContain("unsafe-eval");
      expect(csp).not.toMatch(/(^|;)\s*[a-z-]+ [^;]*\*/);
    });
  }
});

test.describe("authentication is required where it should be", () => {
  const protectedRoutes: [string, string, unknown?][] = [
    ["GET", "/api/me"],
    ["PATCH", "/api/me", { firstName: "X" }],
    ["POST", "/api/auth/logout-all"],
    ["POST", "/api/auth/verify-email/request"],
    ["GET", "/api/orders"],
    ["GET", "/api/orders/1001"],
  ];
  for (const [method, path, data] of protectedRoutes) {
    test(`${method} ${path} → 401 with a Bearer challenge and the JSON envelope`, async () => {
      const api = await client({ origin: null });
      const response = await api.fetch(path, {
        method,
        ...(data
          ? { data: JSON.stringify(data), headers: { "content-type": "application/json" } }
          : {}),
      });
      expect(response.status()).toBe(401);
      expect(response.headers()["www-authenticate"]).toContain("Bearer");
      expect(response.headers()["cache-control"]).toBe("no-store");
      expect(response.headers()["x-request-id"]).toBeTruthy();
      expect((await body(response)).error).toEqual({
        code: "unauthorized",
        message: "Authentication required",
      });
    });
  }

  test("forged, malformed and none-algorithm bearer tokens are rejected", async () => {
    const api = await client({ origin: null });
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from('{"sub":"1","sid":"x","role":"admin"}').toString("base64url")}.`;
    for (const token of ["garbage", "a.b.c", none, "x".repeat(5000)]) {
      const response = await api.get("/api/me", { headers: bearer(token) });
      expect(response.status()).toBe(401);
      expect((await body(response)).error.code).toBe("invalid_token");
    }
    expect((await api.get("/api/me", { headers: { authorization: "Basic abc" } })).status()).toBe(
      401,
    );
  });

  test("refresh without a session is a 401 that never sets a session cookie", async () => {
    const response = await (await client()).post("/api/auth/refresh");
    expect(response.status()).toBe(401);
    expect((await body(response)).error.code).toBe("no_session");
  });
});

test.describe("methods", () => {
  const cases: [string, string][] = [
    ["GET", "/api/auth/register"],
    ["GET", "/api/auth/login"],
    ["GET", "/api/auth/otp/verify"],
    ["GET", "/api/auth/otp/resend"],
    ["GET", "/api/admin/auth/login"],
    ["GET", "/api/admin/auth/verify"],
    ["GET", "/api/admin/auth/resend"],
    ["POST", "/api/admin/me"],
    ["PUT", "/api/admin/users"],
    ["DELETE", "/api/admin/roles"],
    ["POST", "/api/admin/audit"],
    ["DELETE", "/api/admin/posts"],
    ["GET", "/api/admin/posts/bulk"],
    ["POST", "/api/admin/posts/64b7f0c2a1b2c3d4e5f60718"],
    ["PUT", "/api/admin/categories"],
    ["GET", "/api/admin/categories/64b7f0c2a1b2c3d4e5f60718"],
    ["POST", "/api/admin/tags"],
    ["POST", "/api/admin/enquiries"],
    ["PUT", "/api/admin/enquiries/64b7f0c2a1b2c3d4e5f60718"],
    ["POST", "/api/admin/enquiries/export"],
    ["GET", "/api/admin/tags/64b7f0c2a1b2c3d4e5f60718"],
    ["PUT", "/api/admin/media"],
    ["PUT", "/api/admin/products"],
    ["POST", "/api/admin/products/7000000000001"],
    ["GET", "/api/admin/products/7000000000001/variants"],
    ["GET", "/api/admin/products/7000000000001/channels"],
    ["POST", "/api/admin/products/7000000000001/channels"],
    ["POST", "/api/admin/shop/collections"],
    ["POST", "/api/admin/shop/locations"],
    ["POST", "/api/admin/inventory"],
    ["GET", "/api/admin/inventory/adjust"],
    ["GET", "/api/admin/inventory/stock"],
    ["POST", "/api/admin/inventory/history"],
    ["DELETE", "/api/admin/inventory/settings"],
    ["POST", "/api/admin/orders"],
    ["PUT", "/api/admin/orders/export"],
    ["POST", "/api/admin/orders/19044385325171"],
    ["DELETE", "/api/admin/orders/19044385325171"],
    ["GET", "/api/admin/orders/19044385325171/fulfill"],
    ["GET", "/api/admin/orders/19044385325171/cancel"],
    ["GET", "/api/admin/orders/19044385325171/refund"],
    ["POST", "/api/admin/subscriptions"],
    ["POST", "/api/admin/subscriptions/123"],
    ["DELETE", "/api/admin/subscriptions/123"],
    ["POST", "/api/admin/pages"],
    ["DELETE", "/api/admin/pages/home"],
    ["GET", "/api/admin/pages/home/publish"],
    ["GET", "/api/admin/pages/home/discard"],
    ["PUT", "/api/admin/campaigns"],
    ["GET", "/api/admin/campaigns/preview"],
    ["POST", "/api/admin/campaigns/audience"],
    ["PATCH", "/api/admin/campaigns/64b7f0c2a1b2c3d4e5f60718"],
    ["GET", "/api/admin/campaigns/64b7f0c2a1b2c3d4e5f60718/send"],
    ["GET", "/api/admin/campaigns/64b7f0c2a1b2c3d4e5f60718/test"],
    ["GET", "/api/admin/campaigns/64b7f0c2a1b2c3d4e5f60718/schedule"],
    ["POST", "/api/admin/media/summary"],
    ["GET", "/api/admin/media/bulk"],
    ["PUT", "/api/admin/media/folders"],
    ["POST", "/api/admin/media/64b7f0c2a1b2c3d4e5f60718/file"],
    ["GET", "/api/admin/media/64b7f0c2a1b2c3d4e5f60718/file"],
    ["POST", "/blog/feed.xml"],
    ["GET", "/api/auth/refresh"],
    ["GET", "/api/auth/logout"],
    ["GET", "/api/auth/forgot-password"],
    ["GET", "/api/auth/reset-password"],
    ["GET", "/api/auth/verify-email/confirm"],
    ["PUT", "/api/me"],
    ["POST", "/api/me"],
    ["POST", "/api/me/export"],
    ["DELETE", "/api/me/export"],
    ["POST", "/api/orders"],
    ["DELETE", "/api/orders/1"],
    ["GET", "/api/newsletter"],
    ["GET", "/api/newsletter/confirm"],
    ["GET", "/api/newsletter/unsubscribe"],
    ["POST", "/api/cron/jobs"],
    ["GET", "/api/webhooks/shopify"],
  ];
  for (const [method, path] of cases) {
    test(`${method} ${path} → 405`, async () => {
      const response = await (await client()).fetch(path, { method });
      expect(response.status()).toBe(405);
    });
  }
});

test.describe("hostile input never causes a server error", () => {
  const postRoutes = [
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/otp/verify",
    "/api/auth/otp/resend",
    "/api/admin/auth/login",
    "/api/admin/auth/verify",
    "/api/admin/auth/resend",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/verify-email/confirm",
    "/api/newsletter",
    "/api/newsletter/confirm",
    "/api/newsletter/unsubscribe",
  ];
  const payloads: [string, string][] = [
    ["truncated JSON", "{"],
    ["array", "[]"],
    ["null", "null"],
    ["bare string", '"hello"'],
    ["number", "42"],
    ["prototype pollution", '{"__proto__":{"admin":true},"constructor":{"prototype":{"x":1}}}'],
    ["NoSQL operator objects", '{"email":{"$ne":null},"password":{"$gt":""},"token":{"$ne":""}}'],
    ["oversized body", JSON.stringify({ email: "a@b.co", pad: "x".repeat(20_000) })],
    [
      "unicode and control chars",
      JSON.stringify({ email: "a\u0000@b.co", password: "‮\u0000", token: "\ud800" }),
    ],
  ];

  for (const route of postRoutes) {
    test(`${route} answers every malformed body with a 4xx JSON error`, async () => {
      const api = await client({ origin: route.includes("unsubscribe") ? null : baseURL });
      for (const [label, payload] of payloads) {
        const response = await api.post(route, {
          data: payload,
          headers: { "content-type": "application/json" },
        });
        expect(response.status(), `${route} with ${label}`).toBeGreaterThanOrEqual(400);
        expect(response.status(), `${route} with ${label}`).toBeLessThan(500);
        expect((await body(response)).error.code, `${route} with ${label}`).toBeTruthy();
      }
      const wrongType = await api.post(route, {
        data: "{}",
        headers: { "content-type": "text/plain" },
      });
      expect(wrongType.status()).toBeLessThan(500);
    });
  }

  test("NoSQL operators cannot bypass login or enumerate accounts", async () => {
    const api = await client();
    const { email } = await signUp(api);
    for (const attempt of [
      { email: { $ne: null }, password: { $ne: null } },
      { email: { $gt: "" }, password: password },
      { email, password: { $ne: "x" } },
    ]) {
      const response = await json(await client(), "/api/auth/login", attempt);
      expect(response.status()).toBe(400);
      expect(JSON.stringify(await body(response))).not.toContain(email);
    }
  });

  test("error responses never leak stack traces, connection strings or file paths", async () => {
    const api = await client();
    for (const path of postRoutes) {
      const response = await api.post(path, {
        data: "{",
        headers: { "content-type": "application/json" },
      });
      expect(await response.text()).not.toMatch(
        /at .+\(|node_modules|mongodb(\+srv)?:\/\/|\/home\/|stack/i,
      );
    }
  });
});

test.describe("CSRF: state-changing browser endpoints reject foreign origins", () => {
  const routes: [string, unknown][] = [
    ["/api/auth/register", { email: "a@b.co", password, firstName: "A", lastName: "B" }],
    ["/api/auth/login", { email: "a@b.co", password }],
    ["/api/auth/otp/verify", { challenge: "x".repeat(22), code: "123456" }],
    ["/api/auth/otp/resend", { challenge: "x".repeat(22) }],
    ["/api/admin/auth/login", { email: "a@b.co", password }],
    ["/api/admin/auth/verify", { challenge: "x".repeat(22), code: "123456" }],
    ["/api/admin/auth/resend", { challenge: "x".repeat(22) }],
    ["/api/auth/refresh", undefined],
    ["/api/auth/logout", undefined],
    ["/api/auth/forgot-password", { email: "a@b.co" }],
    ["/api/auth/reset-password", { token: "x".repeat(40), password }],
    ["/api/auth/verify-email/confirm", { token: "x".repeat(40) }],
    ["/api/newsletter", { email: "a@b.co" }],
    ["/api/newsletter/confirm", { token: "x".repeat(40) }],
  ];
  for (const [path, data] of routes) {
    test(`${path} → 403 for a cross-site origin and for a request with no origin`, async () => {
      for (const origin of ["https://evil.example", null, "null"]) {
        const api = await client({ origin: null });
        const response = await api.post(path, {
          headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
          ...(data ? { data: JSON.stringify(data) } : {}),
        });
        expect(response.status(), `origin=${origin}`).toBe(403);
        expect((await body(response)).error.code).toBe("csrf_blocked");
      }
    });
  }
});

test.describe("full account lifecycle over HTTP", () => {
  test("register → me → patch (no mass assignment) → refresh rotates → logout revokes", async () => {
    const api = await client();
    const email = uniqueEmail("life");
    const register = await json(api, "/api/auth/register", {
      email,
      password,
      firstName: "Ada",
      lastName: "Lovelace",
      role: "admin",
      emailVerifiedAt: "2020-01-01",
    });
    expect(register.status()).toBe(201);
    const registered = await body(register);
    expect(registered.data.user).toMatchObject({ email, role: "customer", emailVerified: false });
    expect(JSON.stringify(registered)).not.toMatch(/passwordHash|argon2|refreshToken|sessions/);

    const cookies = register
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value);
    const refresh = cookies.find((c) => /fw_rt=/.test(c))!;
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/SameSite=Strict/i);
    expect(refresh).toMatch(/Path=\/api\/auth/);
    expect(refresh).toMatch(/Max-Age=604800/);

    const token = registered.data.accessToken as string;
    expect((await api.get("/api/me", { headers: bearer(token) })).status()).toBe(200);

    const patched = await json(
      api,
      "/api/me",
      { firstName: "Augusta", role: "admin", email: "other@example.com", passwordHash: "x" },
      "patch",
      bearer(token),
    );
    expect(patched.status()).toBe(200);
    expect((await body(patched)).data.user).toMatchObject({
      firstName: "Augusta",
      role: "customer",
      email,
    });

    expect((await json(api, "/api/me", { phone: "abc" }, "patch", bearer(token))).status()).toBe(
      400,
    );
    expect((await json(api, "/api/me", {}, "patch", bearer(token))).status()).toBe(400);

    const rotated = await api.post("/api/auth/refresh");
    expect(rotated.status()).toBe(200);
    const next = (await body(rotated)).data;
    expect(next.accessToken).not.toBe(token);
    expect((await api.get("/api/me", { headers: bearer(next.accessToken) })).status()).toBe(200);

    expect((await api.post("/api/auth/logout")).status()).toBe(204);
    expect((await api.get("/api/me", { headers: bearer(next.accessToken) })).status()).toBe(401);
    expect((await api.post("/api/auth/refresh")).status()).toBe(401);
  });

  test("duplicate email is a 409 and validation errors name the fields", async () => {
    const api = await client();
    const { email } = await signUp(api);
    const dup = await json(await client(), "/api/auth/register", {
      email: email.toUpperCase(),
      password,
      firstName: "A",
      lastName: "B",
    });
    expect(dup.status()).toBe(409);
    expect((await body(dup)).error.code).toBe("email_taken");

    const invalid = await json(await client(), "/api/auth/register", {
      email: "nope",
      password: "short",
      firstName: "",
      lastName: "x".repeat(200),
    });
    expect(invalid.status()).toBe(400);
    const { error } = await body(invalid);
    expect(error.fields.map((f: { path: string }) => f.path).sort()).toEqual([
      "email",
      "firstName",
      "lastName",
      "password",
    ]);
  });

  test("login: generic failure, case-insensitive email, lockout after repeated failures with Retry-After", async () => {
    const ip = randomIp();
    const { email } = await signUp(await client({ ip }));
    const api = await client({ ip });

    const wrong = await json(api, "/api/auth/login", { email, password: "not-the-password" });
    const ghost = await json(api, "/api/auth/login", {
      email: "ghost@example.com",
      password: "not-the-password",
    });
    expect(wrong.status()).toBe(401);
    expect(await body(wrong)).toEqual(await body(ghost)); // identical: no account enumeration

    expect(
      (await json(api, "/api/auth/login", { email: email.toUpperCase(), password })).status(),
    ).toBe(200);

    for (let i = 0; i < 5; i++)
      await json(api, "/api/auth/login", { email, password: "bad-bad-bad-bad" });
    const locked = await json(api, "/api/auth/login", { email, password });
    expect(locked.status()).toBe(429);
    expect(Number(locked.headers()["retry-after"])).toBeGreaterThan(0);
    expect((await body(locked)).error.code).toBe("account_locked");
  });

  test("per-IP rate limit on registration returns 429 with Retry-After", async () => {
    const ip = randomIp();
    let last: APIResponse | undefined;
    for (let i = 0; i < 11; i++) {
      last = await json(await client({ ip }), "/api/auth/register", {
        email: uniqueEmail("rl"),
        password,
        firstName: "A",
        lastName: "B",
      });
    }
    expect(last?.status()).toBe(429);
    expect(last?.headers()["retry-after"]).toBeTruthy();
    expect((await body(last!)).error.code).toBe("rate_limited");
  });
});

test.describe("two-step sign-in and the admin boundary over HTTP", () => {
  const forgedHandle = "A".repeat(22);

  test("password login opens no session; only the emailed code does, and it works once", async () => {
    const ip = randomIp();
    const { email } = await signUp(await client({ ip }));
    const api = await client({ ip });
    const since = new Date(Date.now() - 1000);

    const first = await json(api, "/api/auth/login", { email, password });
    expect(first.status()).toBe(200);
    expect(first.headers()["set-cookie"]).toBeUndefined();
    const { data } = await body(first);
    expect(data.accessToken).toBeUndefined();
    expect(data.ref).toBeTruthy();

    const wrong = await json(api, "/api/auth/otp/verify", { challenge: data.ref, code: "000000" });
    expect(wrong.status()).toBe(400);
    expect((await body(wrong)).error.code).toBe("invalid_code");

    const code = await latestOtpCode(email, since);
    const ok = await json(api, "/api/auth/otp/verify", { challenge: data.ref, code });
    expect(ok.status()).toBe(200);
    expect(ok.headers()["set-cookie"]).toMatch(/HttpOnly/i);
    const token = (await body(ok)).data.accessToken as string;
    expect((await api.get("/api/me", { headers: bearer(token) })).status()).toBe(200);

    const replay = await json(api, "/api/auth/otp/verify", { challenge: data.ref, code });
    expect(replay.status()).toBe(400);
  });

  test("the code is locked after 5 wrong guesses, even for the right code", async () => {
    const ip = randomIp();
    const { email } = await signUp(await client({ ip }));
    const api = await client({ ip });
    const since = new Date(Date.now() - 1000);
    const { data } = await body(await json(api, "/api/auth/login", { email, password }));
    const code = await latestOtpCode(email, since);
    const wrongCode = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      await json(api, "/api/auth/otp/verify", { challenge: data.ref, code: wrongCode });
    const late = await json(api, "/api/auth/otp/verify", { challenge: data.ref, code });
    expect(late.status()).toBe(400);
  });

  test("a wrong password never produces a code", async () => {
    const { email } = await signUp(await client());
    const since = new Date();
    const response = await json(await client(), "/api/auth/login", {
      email,
      password: "not-the-password",
    });
    expect(response.status()).toBe(401);
    await expect(latestOtpCode(email, since)).rejects.toThrow("No sign-in code");
  });

  test("a forged or unknown code handle is rejected without detail", async () => {
    const api = await client();
    const verify = await json(api, "/api/auth/otp/verify", {
      challenge: forgedHandle,
      code: "123456",
    });
    expect(verify.status()).toBe(400);
    expect((await body(verify)).error.code).toBe("invalid_code");
    expect((await json(api, "/api/auth/otp/resend", { challenge: forgedHandle })).status()).toBe(
      400,
    );
  });

  const adminCalls: [string, string][] = [
    ["GET", "/api/admin/me"],
    ["GET", "/api/admin/users"],
    ["POST", "/api/admin/users"],
    ["PATCH", "/api/admin/users/64b7f0c2a1b2c3d4e5f60718"],
    ["GET", "/api/admin/roles"],
    ["POST", "/api/admin/roles"],
    ["PATCH", "/api/admin/roles/editor"],
    ["DELETE", "/api/admin/roles/editor"],
    ["GET", "/api/admin/audit"],
    ["GET", "/api/admin/posts"],
    ["POST", "/api/admin/posts"],
    ["GET", "/api/admin/posts/64b7f0c2a1b2c3d4e5f60718"],
    ["PUT", "/api/admin/posts/64b7f0c2a1b2c3d4e5f60718"],
    ["POST", "/api/admin/posts/bulk"],
    ["GET", "/api/admin/categories"],
    ["POST", "/api/admin/categories"],
    ["PATCH", "/api/admin/categories/64b7f0c2a1b2c3d4e5f60718"],
    ["DELETE", "/api/admin/categories/64b7f0c2a1b2c3d4e5f60718"],
    ["GET", "/api/admin/tags"],
    ["PATCH", "/api/admin/tags/64b7f0c2a1b2c3d4e5f60718"],
    ["DELETE", "/api/admin/tags/64b7f0c2a1b2c3d4e5f60718"],
    ["GET", "/api/admin/enquiries?kind=contact"],
    ["GET", "/api/admin/enquiries/64b7f0c2a1b2c3d4e5f60718"],
    ["PATCH", "/api/admin/enquiries/64b7f0c2a1b2c3d4e5f60718"],
    ["DELETE", "/api/admin/enquiries/64b7f0c2a1b2c3d4e5f60718"],
    ["POST", "/api/admin/enquiries/64b7f0c2a1b2c3d4e5f60718/notes"],
    ["GET", "/api/admin/enquiries/assignees"],
    ["GET", "/api/admin/enquiries/export?kind=contact"],
    ["GET", "/api/admin/media"],
    ["POST", "/api/admin/media"],
    ["PATCH", "/api/admin/media/64b7f0c2a1b2c3d4e5f60718"],
    ["DELETE", "/api/admin/media/64b7f0c2a1b2c3d4e5f60718"],
    ["GET", "/api/admin/orders"],
    ["GET", "/api/admin/media/summary"],
    ["GET", "/api/admin/media/64b7f0c2a1b2c3d4e5f60718"],
    ["POST", "/api/admin/media/bulk"],
    ["GET", "/api/admin/media/folders"],
    ["POST", "/api/admin/media/folders"],
    ["PATCH", "/api/admin/media/folders/64b7f0c2a1b2c3d4e5f60718"],
    ["DELETE", "/api/admin/media/folders/64b7f0c2a1b2c3d4e5f60718"],
    ["PUT", "/api/admin/media/64b7f0c2a1b2c3d4e5f60718/file"],
    ["GET", "/api/admin/campaigns"],
    ["POST", "/api/admin/campaigns"],
    ["GET", "/api/admin/campaigns/audience"],
    ["POST", "/api/admin/campaigns/preview"],
    ["GET", "/api/admin/campaigns/64b7f0c2a1b2c3d4e5f60718"],
    ["PUT", "/api/admin/campaigns/64b7f0c2a1b2c3d4e5f60718"],
    ["DELETE", "/api/admin/campaigns/64b7f0c2a1b2c3d4e5f60718"],
    ["POST", "/api/admin/campaigns/64b7f0c2a1b2c3d4e5f60718/test"],
    ["POST", "/api/admin/campaigns/64b7f0c2a1b2c3d4e5f60718/send"],
    ["POST", "/api/admin/campaigns/64b7f0c2a1b2c3d4e5f60718/schedule"],
    ["DELETE", "/api/admin/campaigns/64b7f0c2a1b2c3d4e5f60718/schedule"],
    ["GET", "/api/admin/pages"],
    ["GET", "/api/admin/pages/home"],
    ["PUT", "/api/admin/pages/home"],
    ["POST", "/api/admin/pages/home/publish"],
    ["POST", "/api/admin/pages/home/discard"],
    ["GET", "/api/admin/subscriptions"],
    ["GET", "/api/admin/subscriptions/123"],
    ["PUT", "/api/admin/subscriptions/123"],
    ["GET", "/api/admin/orders/export"],
    ["GET", "/api/admin/orders/19044385325171"],
    ["PATCH", "/api/admin/orders/19044385325171"],
    ["POST", "/api/admin/orders/19044385325171/fulfill"],
    ["POST", "/api/admin/orders/19044385325171/cancel"],
    ["POST", "/api/admin/orders/19044385325171/refund"],
    ["GET", "/api/admin/products"],
    ["POST", "/api/admin/products"],
    ["GET", "/api/admin/products/7000000000001"],
    ["PATCH", "/api/admin/products/7000000000001"],
    ["DELETE", "/api/admin/products/7000000000001"],
    ["PUT", "/api/admin/products/7000000000001/variants"],
    ["DELETE", "/api/admin/products/7000000000001/variants"],
    ["POST", "/api/admin/products/7000000000001/options"],
    ["PATCH", "/api/admin/products/7000000000001/options"],
    ["DELETE", "/api/admin/products/7000000000001/options"],
    ["POST", "/api/admin/products/7000000000001/images"],
    ["PUT", "/api/admin/products/7000000000001/images"],
    ["DELETE", "/api/admin/products/7000000000001/images"],
    ["PUT", "/api/admin/products/7000000000001/channels"],
    ["GET", "/api/admin/shop/collections"],
    ["GET", "/api/admin/shop/locations"],
    ["GET", "/api/admin/inventory"],
    ["POST", "/api/admin/inventory/adjust"],
    ["POST", "/api/admin/inventory/stock"],
    ["GET", "/api/admin/inventory/history"],
    ["GET", "/api/admin/inventory/settings"],
    ["PUT", "/api/admin/inventory/settings"],
  ];

  for (const [method, path] of adminCalls) {
    test(`${method} ${path} → 401 anonymous, 403 for a signed-in customer`, async () => {
      const anonymous = await (
        await client()
      ).fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        ...(method === "GET" ? {} : { data: "{}" }),
      });
      expect(anonymous.status()).toBe(401);

      const api = await client();
      const { token } = await signUp(api);
      const customer = await api.fetch(path, {
        method,
        headers: { "content-type": "application/json", ...bearer(token) },
        ...(method === "GET" ? {} : { data: "{}" }),
      });
      expect(customer.status()).toBe(403);
      expect((await body(customer)).error.code).toBe("admin_required");
    });
  }

  test("the admin login answers wrong password, unknown and non-admin identically", async () => {
    const { email } = await signUp(await client());
    const responses = [];
    for (const attempt of [
      { email, password },
      { email: "ghost@example.com", password },
      { email, password: "not-the-password" },
    ]) {
      const response = await json(await client(), "/api/admin/auth/login", attempt);
      responses.push([response.status(), (await body(response)).error.code]);
    }
    expect(new Set(responses.map((r) => r.join(":"))).size).toBe(1);
    expect(responses[0]).toEqual([401, "invalid_credentials"]);
  });
});

test.describe("email verification and password reset over HTTP", () => {
  test("verification confirms once; replays and garbage are rejected; resend is limited", async () => {
    const api = await client();
    const { email, token } = await signUp(api);
    const url = new URL(await latestEmailLink("verify-email", email));
    const emailed = url.searchParams.get("token")!;

    expect((await json(api, "/api/auth/verify-email/confirm", { token: emailed })).status()).toBe(
      200,
    );
    expect((await json(api, "/api/auth/verify-email/confirm", { token: emailed })).status()).toBe(
      400,
    );
    expect(
      (await json(api, "/api/auth/verify-email/confirm", { token: "z".repeat(43) })).status(),
    ).toBe(400);
    expect(
      (await body(await api.get("/api/me", { headers: bearer(token) }))).data.user.emailVerified,
    ).toBe(true);

    const other = await client();
    const second = await signUp(other);
    for (let i = 0; i < 3; i++) {
      expect(
        (
          await other.post("/api/auth/verify-email/request", { headers: bearer(second.token) })
        ).status(),
      ).toBe(202);
    }
    expect(
      (
        await other.post("/api/auth/verify-email/request", { headers: bearer(second.token) })
      ).status(),
    ).toBe(429);
  });

  test("forgot → reset: identical answers for unknown emails, one-time link, all sessions revoked", async () => {
    const api = await client();
    const { email, token } = await signUp(api);

    const known = await json(await client(), "/api/auth/forgot-password", { email });
    const unknown = await json(await client(), "/api/auth/forgot-password", {
      email: uniqueEmail("ghost"),
    });
    expect(known.status()).toBe(202);
    expect(unknown.status()).toBe(202);
    expect(await body(known)).toEqual(await body(unknown));

    const reset = new URL(await latestEmailLink("reset-password", email)).searchParams.get(
      "token",
    )!;
    expect(
      (
        await json(await client(), "/api/auth/reset-password", { token: reset, password: "short" })
      ).status(),
    ).toBe(400);
    expect(
      (
        await json(await client(), "/api/auth/reset-password", {
          token: reset,
          password: "a-brand-new-password",
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await json(await client(), "/api/auth/reset-password", {
          token: reset,
          password: "another-new-password",
        })
      ).status(),
    ).toBe(400);

    expect((await api.get("/api/me", { headers: bearer(token) })).status()).toBe(401);
    expect((await json(await client(), "/api/auth/login", { email, password })).status()).toBe(401);
    expect(
      (
        await json(await client(), "/api/auth/login", { email, password: "a-brand-new-password" })
      ).status(),
    ).toBe(200);
  });

  test("forgot-password is rate limited per address", async () => {
    const email = uniqueEmail("flood");
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++)
      statuses.push((await json(await client(), "/api/auth/forgot-password", { email })).status());
    expect(statuses).toEqual([202, 202, 202, 429]);
  });
});

test.describe("newsletter over HTTP", () => {
  test("double opt-in: signup is 202, nothing subscribed until the emailed link is used once", async () => {
    const email = uniqueEmail("news");
    expect((await json(await client(), "/api/newsletter", { email })).status()).toBe(202);
    const token = new URL(await latestEmailLink("newsletter-confirm", email)).searchParams.get(
      "token",
    )!;

    expect((await json(await client(), "/api/newsletter/confirm", { token })).status()).toBe(200);
    expect((await json(await client(), "/api/newsletter/confirm", { token })).status()).toBe(400);

    const again = await json(await client(), "/api/newsletter", { email });
    expect(again.status()).toBe(202); // identical answer for an existing subscriber
  });

  test("unsubscribe is token-authorized (works without Origin for one-click) and rejects forged tokens", async () => {
    const api = await client({ origin: null });
    const forged = `${Buffer.from("victim@example.com").toString("base64url")}.${"A".repeat(43)}`;
    const oneClick = await api.post(
      `/api/newsletter/unsubscribe?token=${encodeURIComponent(forged)}`,
      {
        headers: { "content-type": "application/x-www-form-urlencoded" },
        data: "List-Unsubscribe=One-Click",
      },
    );
    expect(oneClick.status()).toBe(400);
    expect((await body(oneClick)).error.code).toBe("invalid_token");
    expect((await json(api, "/api/newsletter/unsubscribe", { token: forged })).status()).toBe(400);
    expect((await api.post("/api/newsletter/unsubscribe")).status()).toBe(400);
  });
});

test.describe("orders API", () => {
  test("an unverified account gets 403 email_unverified; a verified one gets a clean 503 when Shopify is unavailable", async () => {
    const api = await client();
    const { email, token } = await signUp(api);

    const forbidden = await api.get("/api/orders", { headers: bearer(token) });
    expect(forbidden.status()).toBe(403);
    expect((await body(forbidden)).error.code).toBe("email_unverified");
    expect((await api.get("/api/orders/1001", { headers: bearer(token) })).status()).toBe(403);

    await verify(api, email);
    const unavailable = await api.get("/api/orders", { headers: bearer(token) });
    expect(unavailable.status()).toBe(503);
    const text = await unavailable.text();
    expect(JSON.parse(text).error.code).toBe("orders_unavailable");
    expect(text).not.toMatch(/shopify|admin|token|credential/i);
  });

  test("order ids are strictly numeric and cursors are length-limited", async () => {
    const api = await client();
    const { email, token } = await signUp(api);
    await verify(api, email);
    for (const id of [
      "abc",
      "1%20OR%202",
      "gid%3A%2F%2Fshopify%2FOrder%2F1",
      "9".repeat(40),
      "..%2F..%2Fetc%2Fpasswd",
    ]) {
      expect((await api.get(`/api/orders/${id}`, { headers: bearer(token) })).status(), id).toBe(
        404,
      );
    }
    expect(
      (await api.get(`/api/orders?after=${"x".repeat(600)}`, { headers: bearer(token) })).status(),
    ).toBe(400);
  });
});

test.describe("operational endpoints", () => {
  test("cron sweeper: 403 without the secret, 200 with it, and it reports what it processed", async () => {
    const api = await client({ origin: null });
    expect((await api.get("/api/cron/jobs")).status()).toBe(403);
    expect((await api.get("/api/cron/jobs", { headers: bearer("wrong") })).status()).toBe(403);
    expect(
      (await api.get("/api/cron/jobs", { headers: { authorization: "Bearer" } })).status(),
    ).toBe(403);

    const response = await api.get("/api/cron/jobs", { headers: bearer(runtime().cronSecret) });
    expect(response.status()).toBe(200);
    const { data } = await body(response);
    // SMTP is a closed port in this environment; no Shopify Admin token, so no sync jobs exist.
    expect(data).toEqual({
      attempted: expect.any(Number),
      sent: 0,
      // Scheduled blog posts that came due in this pass (none exist here).
      postsPublished: 0,
      campaignsSent: 0,
      reelsSwept: 0,
      jobs: { attempted: 0, done: 0 },
    });
  });

  test("Shopify webhook: HMAC verified on the raw body; bad, missing and tampered signatures are 401", async () => {
    const api = await client({ origin: null });
    const payload = JSON.stringify({ handle: "monstera-deliciosa" });
    const sign = (value: string, secret = runtime().webhookSecret) =>
      createHmac("sha256", secret).update(value).digest("base64");
    const post = (data: string, headers: Record<string, string>) =>
      api.post("/api/webhooks/shopify", {
        data: Buffer.from(data),
        headers: { "content-type": "application/json", ...headers },
      });

    const ok = await post(payload, {
      "x-shopify-hmac-sha256": sign(payload),
      "x-shopify-topic": "products/update",
    });
    expect(ok.status()).toBe(200);
    expect(await body(ok)).toEqual({ data: { received: true } });

    expect((await post(payload, { "x-shopify-topic": "products/update" })).status()).toBe(401);
    expect(
      (
        await post(payload, {
          "x-shopify-hmac-sha256": "AAAA",
          "x-shopify-topic": "products/update",
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await post(payload, {
          "x-shopify-hmac-sha256": sign(payload, "wrong"),
          "x-shopify-topic": "products/update",
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await post(`${payload} `, {
          "x-shopify-hmac-sha256": sign(payload),
          "x-shopify-topic": "products/update",
        })
      ).status(),
    ).toBe(401);

    const bad = "{nope";
    expect(
      (
        await post(bad, {
          "x-shopify-hmac-sha256": sign(bad),
          "x-shopify-topic": "products/update",
        })
      ).status(),
    ).toBe(400);
    const huge = JSON.stringify({ pad: "x".repeat(1_100_000) });
    expect(
      (
        await post(huge, {
          "x-shopify-hmac-sha256": sign(huge),
          "x-shopify-topic": "products/update",
        })
      ).status(),
    ).toBe(413);
    expect(
      (
        await post(payload, {
          "x-shopify-hmac-sha256": sign(payload),
          "x-shopify-topic": "orders/create",
        })
      ).status(),
    ).toBe(200);
  });
});

test.describe("cart API (Shopify disabled: reads work, writes degrade cleanly)", () => {
  const variantId = "gid://shopify/ProductVariant/1001";
  const lineId = "gid://shopify/CartLine/abc?cart=def";

  test("an anonymous visitor has an empty cart", async () => {
    const api = await client();
    const response = await api.get("/api/cart");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ data: { cart: null } });
    expect(response.headers()["cache-control"]).toBe("no-store");
  });

  test("a forged cart cookie is ignored", async () => {
    const api = await client();
    const response = await api.get("/api/cart", { headers: { cookie: "fw_cart=aaa.bbb" } });
    expect(await response.json()).toEqual({ data: { cart: null } });
  });

  test("adding degrades to a clean 503 without leaking details", async () => {
    const api = await client();
    const response = await json(api, "/api/cart/lines", { variantId });
    expect(response.status()).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("cart_unavailable");
    expect(JSON.stringify(body)).not.toMatch(/shopify|token|stack/i);
  });

  for (const [name, body] of [
    ["non-gid variant", { variantId: "1" }],
    ["quantity too large", { variantId, quantity: 99 }],
    ["quantity negative", { variantId, quantity: -1 }],
    ["prototype pollution", JSON.parse('{"__proto__":{"x":1},"variantId":"bad"}')],
    ["operator object", { variantId: { $ne: "" } }],
  ] as const) {
    test(`rejects ${name}`, async () => {
      const api = await client();
      expect((await json(api, "/api/cart/lines", body)).status()).toBe(400);
    });
  }

  test("gift options are validated before anything reaches Shopify", async () => {
    const api = await client();
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const bouquet = {
      kind: "bouquet",
      recipient: "Asha Patil",
      address: "12 Civil Lines, Nagpur",
      phone: "+91 98765 43210",
      date: tomorrow,
    };
    // A well-formed gift passes validation and then degrades like any add (no Shopify here).
    expect((await json(api, "/api/cart/lines", { variantId, gift: bouquet })).status()).toBe(503);
    expect(
      (
        await json(api, "/api/cart/lines", {
          variantId,
          gift: { kind: "message", message: "Thank you" },
        })
      ).status(),
    ).toBe(503);
    for (const bad of [
      { ...bouquet, date: "2020-01-01" },
      { ...bouquet, phone: "x" },
      { kind: "bouquet", message: "no delivery details" },
      { kind: "message", message: "x".repeat(301) },
      { kind: "message", message: "bell\u0007" },
      { kind: "unknown" },
      { message: "no kind" },
      "just text",
    ]) {
      expect((await json(api, "/api/cart/lines", { variantId, gift: bad })).status()).toBe(400);
    }
    // A booking and a gift together are refused.
    expect(
      (await json(api, "/api/cart/lines", { variantId, gift: bouquet, booking: {} })).status(),
    ).toBe(400);
  });

  test("updates and removals need a cart", async () => {
    const api = await client();
    expect((await json(api, "/api/cart/lines", { lineId, quantity: 1 }, "patch")).status()).toBe(
      400,
    );
    expect((await json(api, "/api/cart/lines", { lineId }, "delete")).status()).toBe(400);
  });

  test("cross-origin writes are blocked", async () => {
    const api = await client({ origin: "https://evil.example" });
    expect((await json(api, "/api/cart/lines", { variantId })).status()).toBe(403);
  });

  test("unsupported methods are refused", async () => {
    const api = await client();
    expect((await api.put("/api/cart/lines", { data: {} })).status()).toBe(405);
    expect((await api.post("/api/cart", { data: {} })).status()).toBe(405);
  });
});

test.describe("wholesale API", () => {
  // A fresh address per test: the endpoint allows 3 applications per address per hour.
  const valid = {
    businessName: "Green Corner Café",
    contactName: "Ada Lovelace",
    get email() {
      return uniqueEmail("wholesale");
    },
    phone: "+91 98765 43210",
    businessType: "Café or restaurant",
    location: "Pune, India",
    message: "We want 40 plants for a new café and ongoing monthly supply.",
  };

  test("accepts a valid application, and a honeypot looks identical", async () => {
    const api = await client();
    const response = await json(api, "/api/wholesale", valid);
    expect(response.status()).toBe(202);
    expect(await response.json()).toEqual({ data: { accepted: true } });
    expect(
      (await json(api, "/api/wholesale", { ...valid, website: "https://spam.example" })).status(),
    ).toBe(202);
  });

  for (const [name, body] of [
    ["header injection", { ...valid, businessName: "Cafe\r\nBcc: x@example.com" }],
    ["operator objects", { ...valid, message: { $gt: "" } }],
    ["bad business type", { ...valid, businessType: "x" }],
    ["prototype pollution", JSON.parse('{"__proto__":{"a":1},"businessName":"x"}')],
    ["oversized body", { ...valid, message: "x".repeat(20_000) }],
  ] as const) {
    test(`rejects ${name} without a server error`, async () => {
      const api = await client();
      expect([400, 413]).toContain((await json(api, "/api/wholesale", body)).status());
    });
  }

  test("cross-origin posts and wrong methods are refused", async () => {
    const foreign = await client({ origin: "https://evil.example" });
    expect((await json(foreign, "/api/wholesale", valid)).status()).toBe(403);
    const api = await client();
    expect((await api.get("/api/wholesale")).status()).toBe(405);
  });
});

test.describe("contact API", () => {
  // A fresh address per test: the endpoint allows 3 messages per address per hour.
  const valid = {
    name: "Ada Lovelace",
    get email() {
      return uniqueEmail("contact");
    },
    topic: "Order or delivery",
    message: "Where is my order? It was due last week.",
  };

  test("accepts a valid message", async () => {
    const api = await client();
    const response = await json(api, "/api/contact", valid);
    expect(response.status()).toBe(202);
    expect(await response.json()).toEqual({ data: { accepted: true } });
  });

  test("a honeypot submission looks identical to a real one", async () => {
    const api = await client();
    const response = await json(api, "/api/contact", { ...valid, website: "https://spam.example" });
    expect(response.status()).toBe(202);
  });

  for (const [name, body] of [
    ["header injection", { ...valid, name: "Ada\r\nBcc: x@example.com" }],
    ["operator objects", { ...valid, message: { $gt: "" } }],
    ["bad topic", { ...valid, topic: "x" }],
    ["prototype pollution", JSON.parse('{"__proto__":{"a":1},"name":"x"}')],
    ["oversized body", { ...valid, message: "x".repeat(20_000) }],
  ] as const) {
    test(`rejects ${name} without a server error`, async () => {
      const api = await client();
      const response = await json(api, "/api/contact", body);
      expect([400, 413]).toContain(response.status());
    });
  }

  test("cross-origin posts and wrong methods are refused", async () => {
    const foreign = await client({ origin: "https://evil.example" });
    expect((await json(foreign, "/api/contact", valid)).status()).toBe(403);
    const api = await client();
    expect((await api.get("/api/contact")).status()).toBe(405);
  });

  test("rate limits repeated submissions", async () => {
    const email = uniqueEmail("limit");
    let last = 0;
    for (let i = 0; i < 4; i++) {
      const api = await client();
      last = (await json(api, "/api/contact", { ...valid, email })).status();
    }
    expect(last).toBe(429);
  });
});

test.describe("cart identity API", () => {
  test("linking needs a valid access token", async () => {
    const api = await client();
    expect((await api.put("/api/cart/identity")).status()).toBe(401);
    const bad = await api.put("/api/cart/identity", { headers: { authorization: "Bearer nope" } });
    expect(bad.status()).toBe(401);
  });

  test("unlinking without a cart is a harmless no-op", async () => {
    const api = await client();
    const response = await api.delete("/api/cart/identity");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ data: { cart: null } });
  });

  test("cross-origin requests are blocked and other methods refused", async () => {
    const foreign = await client({ origin: "https://evil.example" });
    expect((await foreign.delete("/api/cart/identity")).status()).toBe(403);
    expect((await foreign.put("/api/cart/identity")).status()).toBe(403);
    const api = await client();
    expect((await api.post("/api/cart/identity", { data: {} })).status()).toBe(405);
    expect((await api.get("/api/cart/identity")).status()).toBe(405);
  });
});

test.describe("health endpoints", () => {
  test("liveness is public, minimal and uncached", async () => {
    const api = await client({ origin: null });
    const response = await api.get("/api/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ data: { status: "ok" } });
    expect(response.headers()["cache-control"]).toBe("no-store");
  });

  test("readiness needs the secret and reports the database", async () => {
    const api = await client({ origin: null });
    expect((await api.get("/api/health/ready")).status()).toBe(403);
    expect((await api.get("/api/health/ready", { headers: bearer("wrong") })).status()).toBe(403);
    const response = await api.get("/api/health/ready", { headers: bearer(runtime().cronSecret) });
    expect(response.status()).toBe(200);
    const { data } = await body(response);
    expect(data).toMatchObject({ status: "ok", checks: { database: "ok" } });
  });

  test("health endpoints accept only GET", async () => {
    const api = await client();
    expect((await api.post("/api/health", { data: {} })).status()).toBe(405);
    expect((await api.delete("/api/health/ready")).status()).toBe(405);
  });
});

test.describe("privacy API", () => {
  test("export and delete need a valid session", async () => {
    const api = await client();
    expect((await api.get("/api/me/export")).status()).toBe(401);
    expect(
      (await api.get("/api/me/export", { headers: { authorization: "Bearer nope" } })).status(),
    ).toBe(401);
    expect((await json(api, "/api/me", { password: "x" }, "delete")).status()).toBe(401);
  });

  test("delete is same-site only and validates its body", async () => {
    const foreign = await client({ origin: "https://evil.example" });
    expect((await json(foreign, "/api/me", { password: "x" }, "delete")).status()).toBe(403);
  });

  test("a full lifecycle: export, wrong password, delete, then nothing works", async () => {
    const api = await client();
    const email = uniqueEmail("gone");
    const registered = await json(api, "/api/auth/register", {
      email,
      password,
      firstName: "G",
      lastName: "O",
      acceptsMarketing: false,
    });
    expect(registered.status()).toBe(201);
    const { data } = await body(registered);
    const auth = { authorization: `Bearer ${data.accessToken}` };

    const exported = await api.get("/api/me/export", { headers: auth });
    expect(exported.status()).toBe(200);
    expect(exported.headers()["content-disposition"]).toContain("attachment");
    expect((await body(exported)).data.account.email).toBe(email);

    const wrong = await json(api, "/api/me", { password: "definitely wrong" }, "delete", auth);
    expect(wrong.status()).toBe(403);
    expect((await body(wrong)).error.code).toBe("invalid_password");
    expect((await api.get("/api/me", { headers: auth })).status()).toBe(200);

    expect((await json(api, "/api/me", { password }, "delete", auth)).status()).toBe(200);
    expect((await api.get("/api/me", { headers: auth })).status()).toBe(401);
    expect((await api.get("/api/me/export", { headers: auth })).status()).toBe(401);
    expect((await json(api, "/api/auth/login", { email, password })).status()).toBe(401);
  });
});

test.describe("notifications API", () => {
  test("need a valid session", async () => {
    const api = await client();
    expect((await api.get("/api/notifications")).status()).toBe(401);
    expect(
      (await api.get("/api/notifications", { headers: { authorization: "Bearer nope" } })).status(),
    ).toBe(401);
    expect((await json(api, "/api/notifications/read", { all: true })).status()).toBe(401);
  });

  test("a new customer has no notifications, bad input is a 400, and foreign origins are refused", async () => {
    const api = await client();
    const registered = await json(api, "/api/auth/register", {
      email: uniqueEmail("notif"),
      password,
      firstName: "N",
      lastName: "T",
      acceptsMarketing: false,
    });
    const auth = { authorization: `Bearer ${(await body(registered)).data.accessToken}` };

    expect(await body(await api.get("/api/notifications", { headers: auth }))).toEqual({
      data: { unreadCount: 0, items: [] },
    });
    expect((await api.get("/api/notifications?limit=999", { headers: auth })).status()).toBe(400);
    expect(
      (await json(api, "/api/notifications/read", { ids: ["nope"] }, "post", auth)).status(),
    ).toBe(400);
    expect((await json(api, "/api/notifications/read", { all: true }, "post", auth)).status()).toBe(
      200,
    );

    const foreign = await client({ origin: "https://evil.example" });
    expect(
      (await json(foreign, "/api/notifications/read", { all: true }, "post", auth)).status(),
    ).toBe(403);
  });

  test("only the documented methods work", async () => {
    const api = await client();
    expect((await api.post("/api/notifications", { data: {} })).status()).toBe(405);
    expect((await api.get("/api/notifications/read")).status()).toBe(405);
  });
});

test.describe("reels API", () => {
  test("every endpoint needs a valid session, and admin ones an admin", async () => {
    const api = await client();
    const anyId = "a".repeat(24);
    for (const path of [
      "/api/reels",
      "/api/reels/mine",
      `/api/reels/${anyId}`,
      `/api/reels/${anyId}/comments`,
      "/api/admin/reels",
      `/api/admin/reels/${anyId}/comments`,
    ]) {
      expect((await api.get(path)).status(), path).toBe(401);
    }
    for (const path of [
      "/api/reels",
      `/api/reels/${anyId}/complete`,
      `/api/reels/${anyId}/like`,
      `/api/reels/${anyId}/comments`,
      `/api/reels/${anyId}/report`,
    ]) {
      expect((await json(api, path, {})).status(), path).toBe(401);
    }
    expect((await api.delete(`/api/reels/${anyId}`)).status()).toBe(401);
    expect(
      (await json(api, `/api/admin/reels/${anyId}`, { status: "approved" }, "patch")).status(),
    ).toBe(401);
  });

  test("a customer cannot reach moderation, and reels report themselves off without storage", async () => {
    const api = await client();
    const registered = await json(api, "/api/auth/register", {
      email: uniqueEmail("reel"),
      password,
      firstName: "R",
      lastName: "L",
      acceptsMarketing: false,
    });
    const auth = { authorization: `Bearer ${(await body(registered)).data.accessToken}` };
    expect((await api.get("/api/admin/reels", { headers: auth })).status()).toBe(403);
    const feed = await api.get("/api/reels", { headers: auth });
    expect(feed.status()).toBe(503);
    expect((await body(feed)).error.code).toBe("reels_not_configured");

    const foreign = await client({ origin: "https://evil.example" });
    expect((await json(foreign, "/api/reels", {}, "post", auth)).status()).toBe(403);
    expect((await json(api, "/api/reels", { kind: { $ne: 1 } }, "post", auth)).status()).toBe(400);
    expect((await api.put("/api/reels", { headers: auth })).status()).toBe(405);
  });
});

test.describe("wishlist API", () => {
  test("need a valid session", async () => {
    const api = await client();
    expect((await api.get("/api/wishlist")).status()).toBe(401);
    expect((await api.get("/api/wishlist/products")).status()).toBe(401);
    expect(
      (await api.get("/api/wishlist", { headers: { authorization: "Bearer nope" } })).status(),
    ).toBe(401);
    expect(
      (await json(api, "/api/wishlist/items", { handle: "monstera-deliciosa" })).status(),
    ).toBe(401);
  });

  test("save, list, remove; hostile input is a 400, unknown plants a 404, foreign origins a 403", async () => {
    const api = await client();
    const registered = await json(api, "/api/auth/register", {
      email: uniqueEmail("wish"),
      password,
      firstName: "W",
      lastName: "L",
      acceptsMarketing: false,
    });
    const auth = { authorization: `Bearer ${(await body(registered)).data.accessToken}` };

    expect(await body(await api.get("/api/wishlist", { headers: auth }))).toEqual({
      data: { handles: [] },
    });
    const saved = await json(
      api,
      "/api/wishlist/items",
      { handle: "monstera-deliciosa" },
      "post",
      auth,
    );
    expect(await body(saved)).toEqual({ data: { handles: ["monstera-deliciosa"] } });
    const products = await body(await api.get("/api/wishlist/products", { headers: auth }));
    expect(products.data.products.map((p: { slug: string }) => p.slug)).toEqual([
      "monstera-deliciosa",
    ]);

    expect(
      (await json(api, "/api/wishlist/items", { handle: "no-such-plant" }, "post", auth)).status(),
    ).toBe(404);
    for (const bad of [
      { handle: { $ne: "" } },
      { handle: "../x" },
      { handle: "a", extra: 1 },
      {},
    ]) {
      expect((await json(api, "/api/wishlist/items", bad, "post", auth)).status()).toBe(400);
    }

    const foreign = await client({ origin: "https://evil.example" });
    expect(
      (
        await json(foreign, "/api/wishlist/items", { handle: "monstera-deliciosa" }, "post", auth)
      ).status(),
    ).toBe(403);

    const removed = await json(
      api,
      "/api/wishlist/items",
      { handle: "monstera-deliciosa" },
      "delete",
      auth,
    );
    expect(await body(removed)).toEqual({ data: { handles: [] } });
  });

  test("only the documented methods work", async () => {
    const api = await client();
    expect((await api.post("/api/wishlist", { data: {} })).status()).toBe(405);
    expect((await api.get("/api/wishlist/items")).status()).toBe(405);
  });
});

test.describe("mobile auth API", () => {
  const native = { "x-fernwood-client": "app" };

  test("every mobile endpoint refuses a request without the native-client header", async () => {
    const api = await client();
    expect((await json(api, "/api/mobile/auth/register", {})).status()).toBe(403);
    expect((await json(api, "/api/mobile/auth/verify", {})).status()).toBe(403);
    expect(
      (await json(api, "/api/mobile/auth/refresh", { refreshToken: "x".repeat(30) })).status(),
    ).toBe(403);
    expect(
      (await json(api, "/api/mobile/auth/logout", { refreshToken: "x".repeat(30) })).status(),
    ).toBe(403);
  });

  test("sign up, rotate, call an Origin-checked endpoint without an Origin, sign out", async () => {
    const api = await client({ origin: null });
    const registered = await json(
      api,
      "/api/mobile/auth/register",
      {
        email: uniqueEmail("app"),
        password,
        firstName: "A",
        lastName: "P",
        acceptsMarketing: false,
      },
      "post",
      native,
    );
    expect(registered.status()).toBe(201);
    expect(registered.headers()["set-cookie"]).toBeUndefined();
    const session = (await body(registered)).data;
    expect(session.refreshToken).toEqual(expect.any(String));

    const auth = { ...native, authorization: `Bearer ${session.accessToken}` };
    const saved = await json(
      api,
      "/api/wishlist/items",
      { handle: "monstera-deliciosa" },
      "post",
      auth,
    );
    expect(saved.status()).toBe(200);

    const rotated = await json(
      api,
      "/api/mobile/auth/refresh",
      { refreshToken: session.refreshToken },
      "post",
      native,
    );
    expect(rotated.status()).toBe(200);
    const next = (await body(rotated)).data;
    expect(next.refreshToken).not.toBe(session.refreshToken);

    expect(
      (
        await json(api, "/api/mobile/auth/refresh", { refreshToken: "short" }, "post", native)
      ).status(),
    ).toBe(400);
    expect(
      (
        await json(
          api,
          "/api/mobile/auth/logout",
          { refreshToken: next.refreshToken },
          "post",
          native,
        )
      ).status(),
    ).toBe(204);
    expect(
      (
        await json(
          api,
          "/api/mobile/auth/refresh",
          { refreshToken: next.refreshToken },
          "post",
          native,
        )
      ).status(),
    ).toBe(401);
  });
});

test.describe("push registration API", () => {
  const native = { "x-fernwood-client": "app" };
  const token = "ExponentPushToken[abcdefghijklmnopqrstuv]";

  test("needs a session and the native-client header; validates input", async () => {
    const api = await client({ origin: null });
    expect(
      (
        await json(api, "/api/mobile/push", { token, platform: "android" }, "post", native)
      ).status(),
    ).toBe(401);
    const registered = await json(
      api,
      "/api/mobile/auth/register",
      {
        email: uniqueEmail("push"),
        password,
        firstName: "P",
        lastName: "S",
        acceptsMarketing: false,
      },
      "post",
      native,
    );
    const auth = {
      ...native,
      authorization: `Bearer ${(await body(registered)).data.accessToken}`,
    };
    expect(
      (
        await json(api, "/api/mobile/push", { token, platform: "android" }, "post", {
          authorization: auth.authorization,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await json(api, "/api/mobile/push", { token: "nope", platform: "android" }, "post", auth)
      ).status(),
    ).toBe(400);
    expect(
      (await json(api, "/api/mobile/push", { token, platform: "android" }, "post", auth)).status(),
    ).toBe(204);
    expect((await json(api, "/api/mobile/push", { token }, "delete", auth)).status()).toBe(204);
  });
});

test.describe("plant doctor API", () => {
  test("needs a valid session", async () => {
    const api = await client();
    expect((await api.get("/api/plant-doctor")).status()).toBe(401);
    expect((await api.get("/api/plant-doctor/abc")).status()).toBe(401);
    expect((await api.delete("/api/plant-doctor/abc")).status()).toBe(401);
    expect(
      (
        await api.post("/api/plant-doctor", {
          multipart: { photo: { name: "p.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") } },
        })
      ).status(),
    ).toBe(401);
  });

  test("reports itself switched off here, keeps history private, and refuses hostile input", async () => {
    const api = await client();
    const registered = await json(api, "/api/auth/register", {
      email: uniqueEmail("doctor"),
      password,
      firstName: "D",
      lastName: "R",
      acceptsMarketing: false,
    });
    const auth = { authorization: `Bearer ${(await body(registered)).data.accessToken}` };

    expect(await body(await api.get("/api/plant-doctor", { headers: auth }))).toEqual({
      data: { enabled: false, items: [] },
    });
    expect((await api.get("/api/plant-doctor/not-an-id", { headers: auth })).status()).toBe(404);
    expect(
      (await api.get("/api/plant-doctor/aaaaaaaaaaaaaaaaaaaaaaaa", { headers: auth })).status(),
    ).toBe(404);
    expect(
      (await api.delete("/api/plant-doctor/aaaaaaaaaaaaaaaaaaaaaaaa", { headers: auth })).status(),
    ).toBe(204);

    // JSON instead of a photo upload, and no photo at all, are refused before anything else happens.
    expect((await json(api, "/api/plant-doctor", { photo: "x" }, "post", auth)).status()).toBe(400);
    const noKey = await api.post("/api/plant-doctor", {
      headers: auth,
      multipart: {
        photo: { name: "p.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not really a jpeg") },
      },
    });
    expect(noKey.status()).toBe(503);
    expect((await body(noKey)).error.code).toBe("plant_doctor_not_configured");

    const foreign = await client({ origin: "https://evil.example" });
    const blocked = await foreign.post("/api/plant-doctor", {
      headers: auth,
      multipart: { photo: { name: "p.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") } },
    });
    expect(blocked.status()).toBe(403);
  });

  test("only the documented methods work", async () => {
    const api = await client();
    expect((await api.put("/api/plant-doctor", { data: {} })).status()).toBe(405);
    expect((await api.post("/api/plant-doctor/abc", { data: {} })).status()).toBe(405);
  });
});
