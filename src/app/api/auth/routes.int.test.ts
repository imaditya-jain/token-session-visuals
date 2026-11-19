// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { disconnectDb } from "@/server/db/connection";
import { resetEnvCache } from "@/server/config/env";
import { Job } from "@/server/db/models/job";
import { RateLimit } from "@/server/db/models/rate-limit";
import { User } from "@/server/db/models/user";
import { startTestDatabase } from "@/test/mongo";

import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { POST as logoutAll } from "./logout-all/route";
import { POST as refresh } from "./refresh/route";
import { POST as register } from "./register/route";
import { POST as forgotPassword } from "./forgot-password/route";
import { POST as resetPassword } from "./reset-password/route";
import { POST as verifyConfirm } from "./verify-email/confirm/route";
import { POST as verifyRequest } from "./verify-email/request/route";
import { GET as cron } from "../cron/jobs/route";
import { EmailJob } from "@/server/db/models/email-job";
import { AuthToken } from "@/server/db/models/auth-token";
import { GET as me, PATCH as patchMe } from "../me/route";

const ORIGIN = "http://localhost:3100";
const credentials = {
  email: "grace@example.com",
  password: "hopper-cobol-1906",
  firstName: "Grace",
  lastName: "Hopper",
};

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
  await User.deleteMany({});
  await RateLimit.deleteMany({});
  await EmailJob.deleteMany({});
  await AuthToken.deleteMany({});
});

type Init = {
  body?: unknown;
  headers?: Record<string, string>;
  origin?: string | null;
  ip?: string;
};

function request(
  path: string,
  method: string,
  { body, headers = {}, origin = ORIGIN, ip = "198.51.100.1" }: Init = {},
) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(origin ? { origin } : {}),
      "x-forwarded-for": ip,
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const refreshCookieHeader = (response: Response) => {
  const raw = response.headers.getSetCookie().find((c) => c.startsWith("fw_rt="));
  if (!raw) throw new Error("no refresh cookie set");
  return raw;
};
const cookieValue = (setCookie: string) => setCookie.split(";")[0]!;

async function signUp() {
  const response = await register(request("/api/auth/register", "POST", { body: credentials }));
  const body = await response.json();
  return { response, body, cookie: cookieValue(refreshCookieHeader(response)) };
}

describe("POST /api/auth/register", () => {
  it("creates an account, returns an access token in the body and the refresh token only as a hardened cookie", async () => {
    const { response, body } = await signUp();
    expect(response.status).toBe(201);
    expect(body.data.user).toMatchObject({ email: "grace@example.com", role: "customer" });
    expect(body.data.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(body.data.expiresIn).toBe(900);
    expect(JSON.stringify(body)).not.toMatch(/refresh|passwordHash|argon2/i);

    const cookie = refreshCookieHeader(response);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/Max-Age=604800/);
    const hint = response.headers.getSetCookie().find((c) => c.startsWith("fw_auth="));
    expect(hint).toMatch(/^fw_auth=1/);
    expect(hint).not.toMatch(/HttpOnly/i);
    expect(hint).toMatch(/Path=\//);
    expect(hint).not.toContain(cookieValue(cookie).split("=")[1]!);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("validates input with field-level errors", async () => {
    const response = await register(
      request("/api/auth/register", "POST", {
        body: { ...credentials, email: "nope", password: "short" },
      }),
    );
    expect(response.status).toBe(400);
    const { error } = await response.json();
    expect(error.code).toBe("validation_error");
    expect(error.fields.map((f: { path: string }) => f.path).sort()).toEqual(["email", "password"]);
  });

  it("returns 409 for a duplicate email", async () => {
    await signUp();
    const response = await register(request("/api/auth/register", "POST", { body: credentials }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("email_taken");
  });

  it("rejects cross-origin and origin-less requests (CSRF)", async () => {
    const foreign = await register(
      request("/api/auth/register", "POST", { body: credentials, origin: "https://evil.example" }),
    );
    expect(foreign.status).toBe(403);
    const none = await register(
      request("/api/auth/register", "POST", { body: credentials, origin: null }),
    );
    expect(none.status).toBe(403);
    const fetchMetadata = await register(
      request("/api/auth/register", "POST", {
        body: { ...credentials, email: "meta@example.com" },
        origin: null,
        headers: { "sec-fetch-site": "same-origin" },
      }),
    );
    expect(fetchMetadata.status).toBe(201);
  });

  it("rejects non-JSON, malformed and oversized bodies", async () => {
    const wrongType = await register(
      new NextRequest(`${ORIGIN}/api/auth/register`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "text/plain" },
        body: "x",
      }),
    );
    expect(wrongType.status).toBe(400);
    const malformed = await register(
      new NextRequest(`${ORIGIN}/api/auth/register`, {
        method: "POST",
        headers: { origin: ORIGIN, "content-type": "application/json" },
        body: "{oops",
      }),
    );
    expect((await malformed.json()).error.code).toBe("invalid_json");
    const huge = await register(
      request("/api/auth/register", "POST", {
        body: { ...credentials, firstName: "x".repeat(20_000) },
      }),
    );
    expect(huge.status).toBe(413);
  });

  it("rate limits repeated registrations from one IP", async () => {
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await register(
        request("/api/auth/register", "POST", {
          body: { ...credentials, email: `u${i}@example.com` },
          ip: "198.51.100.9",
        }),
      );
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("retry-after")).toBeTruthy();
  });
});

describe("POST /api/auth/login", () => {
  it("signs in and sets a fresh cookie; wrong credentials are generic 401s with a WWW-Authenticate header", async () => {
    await signUp();
    const ok = await login(
      request("/api/auth/login", "POST", {
        body: { email: "GRACE@example.com ", password: credentials.password },
      }),
    );
    expect(ok.status).toBe(200);
    expect(refreshCookieHeader(ok)).toMatch(/HttpOnly/i);

    const bad = await login(
      request("/api/auth/login", "POST", {
        body: { email: credentials.email, password: "wrong-wrong-wrong" },
      }),
    );
    expect(bad.status).toBe(401);
    expect(bad.headers.get("www-authenticate")).toContain("Bearer");
    expect((await bad.json()).error).toEqual({
      code: "invalid_credentials",
      message: "Incorrect email or password.",
    });
  });
});

describe("session lifecycle over HTTP", () => {
  it("refresh rotates the cookie and the access token works on /api/me", async () => {
    const { cookie, body } = await signUp();

    const refreshed = await refresh(request("/api/auth/refresh", "POST", { headers: { cookie } }));
    expect(refreshed.status).toBe(200);
    const next = (await refreshed.json()).data;
    expect(next.accessToken).not.toBe(body.data.accessToken);
    const newCookie = cookieValue(refreshCookieHeader(refreshed));
    expect(newCookie).not.toBe(cookie);

    const profile = await me(
      request("/api/me", "GET", {
        headers: { authorization: `Bearer ${next.accessToken}` },
        origin: null,
      }),
    );
    expect(profile.status).toBe(200);
    expect((await profile.json()).data.user.email).toBe("grace@example.com");
  });

  it("refresh without a cookie, or with a bogus one, is a 401 that clears the cookie", async () => {
    const none = await refresh(request("/api/auth/refresh", "POST"));
    expect(none.status).toBe(401);
    expect((await none.json()).error.code).toBe("no_session");

    const bogus = await refresh(
      request("/api/auth/refresh", "POST", { headers: { cookie: "fw_rt=forged-token" } }),
    );
    expect(bogus.status).toBe(401);
    expect(refreshCookieHeader(bogus)).toMatch(/Max-Age=0/);
  });

  it("refresh is CSRF protected", async () => {
    const { cookie } = await signUp();
    const response = await refresh(
      request("/api/auth/refresh", "POST", { headers: { cookie }, origin: "https://evil.example" }),
    );
    expect(response.status).toBe(403);
  });

  it("logout revokes the session: the cookie stops working and the access token is rejected", async () => {
    const { cookie, body } = await signUp();
    const out = await logout(request("/api/auth/logout", "POST", { headers: { cookie } }));
    expect(out.status).toBe(204);
    expect(refreshCookieHeader(out)).toMatch(/Max-Age=0/);

    const again = await refresh(request("/api/auth/refresh", "POST", { headers: { cookie } }));
    expect(again.status).toBe(401);
    const profile = await me(
      request("/api/me", "GET", {
        headers: { authorization: `Bearer ${body.data.accessToken}` },
        origin: null,
      }),
    );
    expect(profile.status).toBe(401);
    expect((await profile.json()).error.code).toBe("session_revoked");
  });

  it("logout-all needs a bearer token and revokes every device", async () => {
    const { body } = await signUp();
    const second = await login(
      request("/api/auth/login", "POST", {
        body: { email: credentials.email, password: credentials.password },
      }),
    );
    const secondToken = (await second.json()).data.accessToken;

    expect(
      (await logoutAll(request("/api/auth/logout-all", "POST", { origin: null }))).status,
    ).toBe(401);
    const out = await logoutAll(
      request("/api/auth/logout-all", "POST", {
        headers: { authorization: `Bearer ${body.data.accessToken}` },
        origin: null,
      }),
    );
    expect(out.status).toBe(204);
    const profile = await me(
      request("/api/me", "GET", {
        headers: { authorization: `Bearer ${secondToken}` },
        origin: null,
      }),
    );
    expect(profile.status).toBe(401);
  });
});

describe("/api/me", () => {
  it("is not reachable anonymously", async () => {
    const response = await me(request("/api/me", "GET", { origin: null }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("updates the profile and validates input", async () => {
    const { body } = await signUp();
    const headers = { authorization: `Bearer ${body.data.accessToken}` };
    const ok = await patchMe(
      request("/api/me", "PATCH", {
        headers,
        body: { firstName: "Amazing", phone: "+1 555 010 9999" },
        origin: null,
      }),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.user).toMatchObject({
      firstName: "Amazing",
      phone: "+1 555 010 9999",
    });

    const empty = await patchMe(request("/api/me", "PATCH", { headers, body: {}, origin: null }));
    expect(empty.status).toBe(400);
    const badPhone = await patchMe(
      request("/api/me", "PATCH", { headers, body: { phone: "abc" }, origin: null }),
    );
    expect(badPhone.status).toBe(400);
  });

  it("cannot escalate privileges through the body", async () => {
    const { body } = await signUp();
    const headers = { authorization: `Bearer ${body.data.accessToken}` };
    await patchMe(
      request("/api/me", "PATCH", {
        headers,
        body: { firstName: "G", role: "admin", email: "x@y.z" },
        origin: null,
      }),
    );
    const user = await User.findOne({ email: credentials.email }).lean();
    expect(user?.role).toBe("customer");
    expect(user?.email).toBe(credentials.email);
  });
});

const emailedToken = async (template: string) => {
  const job = await EmailJob.findOne({ template }).sort({ createdAt: -1 }).lean();
  return new URL(String((job?.data as { url: string }).url)).searchParams.get("token")!;
};

describe("password reset over HTTP", () => {
  it("answers identically for known and unknown emails (no account enumeration) and only emails real accounts", async () => {
    await signUp();
    await EmailJob.deleteMany({});

    const known = await forgotPassword(
      request("/api/auth/forgot-password", "POST", { body: { email: credentials.email } }),
    );
    const unknown = await forgotPassword(
      request("/api/auth/forgot-password", "POST", { body: { email: "ghost@example.com" } }),
    );
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(await known.json()).toEqual(await unknown.json());
    expect(await EmailJob.countDocuments({ template: "reset-password" })).toBe(1);
  });

  it("limits reset emails per address and per IP, and rejects cross-origin calls", async () => {
    await signUp();
    const call = (ip: string, email = credentials.email, origin: string | null = ORIGIN) =>
      forgotPassword(request("/api/auth/forgot-password", "POST", { body: { email }, ip, origin }));
    expect((await call("198.51.100.20")).status).toBe(202);
    expect((await call("198.51.100.21")).status).toBe(202);
    expect((await call("198.51.100.22")).status).toBe(202);
    const blocked = await call("198.51.100.23");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();

    expect((await call("198.51.100.30", "other@example.com", "https://evil.example")).status).toBe(
      403,
    );
  });

  it("resets with the emailed token, then the old password and the old sessions stop working", async () => {
    const { cookie, body } = await signUp();
    await forgotPassword(
      request("/api/auth/forgot-password", "POST", { body: { email: credentials.email } }),
    );
    const token = await emailedToken("reset-password");

    const weak = await resetPassword(
      request("/api/auth/reset-password", "POST", { body: { token, password: "short" } }),
    );
    expect(weak.status).toBe(400);

    const ok = await resetPassword(
      request("/api/auth/reset-password", "POST", {
        body: { token, password: "brand-new-password" },
      }),
    );
    expect(ok.status).toBe(200);

    const replay = await resetPassword(
      request("/api/auth/reset-password", "POST", {
        body: { token, password: "brand-new-password-2" },
      }),
    );
    expect(replay.status).toBe(400);
    expect((await replay.json()).error.code).toBe("invalid_token");

    expect(
      (await refresh(request("/api/auth/refresh", "POST", { headers: { cookie } }))).status,
    ).toBe(401);
    const profile = await me(
      request("/api/me", "GET", {
        headers: { authorization: `Bearer ${body.data.accessToken}` },
        origin: null,
      }),
    );
    expect(profile.status).toBe(401);
    const old = await login(
      request("/api/auth/login", "POST", {
        body: { email: credentials.email, password: credentials.password },
      }),
    );
    expect(old.status).toBe(401);
    const fresh = await login(
      request("/api/auth/login", "POST", {
        body: { email: credentials.email, password: "brand-new-password" },
      }),
    );
    expect(fresh.status).toBe(200);
  });
});

describe("email verification over HTTP", () => {
  it("confirms an account with the emailed token and exposes the flag on /api/me", async () => {
    const { body } = await signUp();
    const headers = { authorization: `Bearer ${body.data.accessToken}` };
    expect(
      (await (await me(request("/api/me", "GET", { headers, origin: null }))).json()).data.user
        .emailVerified,
    ).toBe(false);

    const token = await emailedToken("verify-email");
    const ok = await verifyConfirm(
      request("/api/auth/verify-email/confirm", "POST", { body: { token } }),
    );
    expect(ok.status).toBe(200);
    expect(
      (await (await me(request("/api/me", "GET", { headers, origin: null }))).json()).data.user
        .emailVerified,
    ).toBe(true);

    const again = await verifyConfirm(
      request("/api/auth/verify-email/confirm", "POST", { body: { token } }),
    );
    expect(again.status).toBe(400);
  });

  it("re-sending requires sign-in and is rate limited to 3 per hour", async () => {
    const { body } = await signUp();
    expect(
      (await verifyRequest(request("/api/auth/verify-email/request", "POST", { origin: null })))
        .status,
    ).toBe(401);
    const headers = { authorization: `Bearer ${body.data.accessToken}` };
    for (let i = 0; i < 3; i++) {
      expect(
        (
          await verifyRequest(
            request("/api/auth/verify-email/request", "POST", { headers, origin: null }),
          )
        ).status,
      ).toBe(202);
    }
    expect(
      (
        await verifyRequest(
          request("/api/auth/verify-email/request", "POST", { headers, origin: null }),
        )
      ).status,
    ).toBe(429);
  });
});

describe("GET /api/cron/jobs", () => {
  const call = (authorization?: string) =>
    cron(
      request("/api/cron/jobs", "GET", {
        origin: null,
        ...(authorization ? { headers: { authorization } } : {}),
      }),
    );

  it("is not public: it needs the cron secret", async () => {
    expect((await call()).status).toBe(403);
    expect((await call("Bearer wrong-secret")).status).toBe(403);
  });

  it("with the secret it sweeps due jobs", async () => {
    const { setTransportForTests } = await import("@/server/email/mailer");
    const sendMail = vi.fn().mockResolvedValue({});
    setTransportForTests({ sendMail });
    await signUp();
    // Registration also queues a Shopify customer sync; this test is about the email sweep only, so run it
    // without Shopify Admin configured (no sync jobs, no mirror backfill, no network).
    await Job.deleteMany({});
    vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "");
    resetEnvCache();
    const response = await call("Bearer cron-secret-for-tests-0123456789");
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      attempted: 1,
      sent: 1,
      jobs: { attempted: 0, done: 0 },
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    setTransportForTests(undefined);
    vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "shpat_admin_token_for_tests");
    resetEnvCache();
  });

  it("fails closed when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "cron-secret-for-tests-0123456789");
  });
});
