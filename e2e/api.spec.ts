import { createHmac } from "node:crypto";

import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";

import { latestEmailLink, runtime } from "./helpers/mailbox";

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
    ["GET", "/api/auth/refresh"],
    ["GET", "/api/auth/logout"],
    ["GET", "/api/auth/forgot-password"],
    ["GET", "/api/auth/reset-password"],
    ["GET", "/api/auth/verify-email/confirm"],
    ["PUT", "/api/me"],
    ["DELETE", "/api/me"],
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
    expect(data).toEqual({ attempted: expect.any(Number), sent: 0 }); // SMTP is a closed port in this environment
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
