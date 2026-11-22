// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { hashPassword } from "@/server/auth/password";
import { disconnectDb } from "@/server/db/connection";
import { AuditLog } from "@/server/db/models/audit-log";
import { AuthToken } from "@/server/db/models/auth-token";
import { EmailJob } from "@/server/db/models/email-job";
import { OtpChallenge } from "@/server/db/models/otp-challenge";
import { RateLimit } from "@/server/db/models/rate-limit";
import { Role } from "@/server/db/models/role";
import { User } from "@/server/db/models/user";
import { startTestDatabase } from "@/test/mongo";

import { POST as customerOtpVerify } from "../auth/otp/verify/route";
import { POST as plainLogin } from "../auth/login/route";
import { GET as audit } from "./audit/route";
import { POST as adminLogin } from "./auth/login/route";
import { POST as adminResend } from "./auth/resend/route";
import { POST as adminVerify } from "./auth/verify/route";
import { GET as me } from "./me/route";
import { GET as listRoles, POST as createRole } from "./roles/route";
import { DELETE as deleteRole, PATCH as patchRole } from "./roles/[key]/route";
import { GET as listUsers, POST as invite } from "./users/route";
import { PATCH as patchUser } from "./users/[id]/route";

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
});

beforeEach(async () => {
  const { connectDb } = await import("@/server/db/connection");
  await connectDb();
  await Promise.all([
    User.deleteMany({}),
    RateLimit.deleteMany({}),
    AuthToken.deleteMany({}),
    EmailJob.deleteMany({}),
    OtpChallenge.deleteMany({}),
    Role.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
});

type Init = {
  body?: unknown;
  token?: string;
  origin?: string | null;
  ip?: string;
};

function req(
  path: string,
  method: string,
  { body, token, origin = ORIGIN, ip = "198.51.100.1" }: Init = {},
) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: {
      "x-forwarded-for": ip,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(origin ? { origin } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function makeAdmin(email: string, adminRole: string) {
  await User.create({
    email,
    firstName: "Ada",
    lastName: "Lovelace",
    passwordHash: await hashPassword(PASSWORD),
    role: adminRole === "super_admin" ? "admin" : "staff",
    adminRole,
  });
}

const latestCode = async () =>
  (
    (await EmailJob.findOne({ template: "otp-code" }).sort({ createdAt: -1 }).lean())?.data as {
      code: string;
    }
  ).code;

async function signIn(email: string, ip = "198.51.100.1"): Promise<string> {
  const step1 = await adminLogin(
    req("/api/admin/auth/login", "POST", { body: { email, password: PASSWORD }, ip }),
  );
  const { challenge } = { challenge: (await step1.json()).data.ref as string };
  const step2 = await adminVerify(
    req("/api/admin/auth/verify", "POST", { body: { challenge, code: await latestCode() }, ip }),
  );
  expect(step2.status).toBe(200);
  return (await step2.json()).data.accessToken as string;
}

describe("POST /api/admin/auth/login + verify", () => {
  it("opens no session after the password step, and sets the refresh cookie only after the code", async () => {
    await makeAdmin("boss@example.com", "super_admin");
    const first = await adminLogin(
      req("/api/admin/auth/login", "POST", {
        body: { email: "boss@example.com", password: PASSWORD },
      }),
    );
    expect(first.status).toBe(200);
    expect(first.headers.get("set-cookie")).toBeNull();
    const body = await first.json();
    expect(body.data.accessToken).toBeUndefined();
    expect(first.headers.get("cache-control")).toBe("no-store");

    const second = await adminVerify(
      req("/api/admin/auth/verify", "POST", {
        body: { challenge: body.data.ref, code: await latestCode() },
      }),
    );
    expect(second.status).toBe(200);
    const cookie = second.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
  });

  it("is CSRF protected, validates input and rejects wrong codes", async () => {
    await makeAdmin("boss@example.com", "super_admin");
    const cross = await adminLogin(
      req("/api/admin/auth/login", "POST", {
        body: { email: "boss@example.com", password: PASSWORD },
        origin: "https://evil.example",
      }),
    );
    expect(cross.status).toBe(403);
    expect((await cross.json()).error.code).toBe("csrf_blocked");

    const invalid = await adminVerify(
      req("/api/admin/auth/verify", "POST", {
        body: { challenge: "x".repeat(22), code: "12ab56" },
      }),
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("validation_error");

    const wrong = await adminVerify(
      req("/api/admin/auth/verify", "POST", {
        body: { challenge: "A".repeat(22), code: "123456" },
      }),
    );
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error.code).toBe("invalid_code");
  });

  it("answers wrong password, unknown email and non-admin identically", async () => {
    await makeAdmin("boss@example.com", "super_admin");
    await User.create({
      email: "shopper@example.com",
      firstName: "S",
      lastName: "H",
      passwordHash: await hashPassword(PASSWORD),
    });
    const attempts = [
      { email: "boss@example.com", password: "wrong wrong wrong" },
      { email: "ghost@example.com", password: PASSWORD },
      { email: "shopper@example.com", password: PASSWORD },
    ];
    const results = [];
    for (const [index, body] of attempts.entries()) {
      const res = await adminLogin(
        req("/api/admin/auth/login", "POST", { body, ip: `198.51.100.${index + 10}` }),
      );
      results.push([res.status, (await res.json()).error.code]);
    }
    expect(new Set(results.map((r) => r.join(":"))).size).toBe(1);
    expect(results[0]).toEqual([401, "invalid_credentials"]);
  });

  it("rate limits password guessing per IP", async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) {
      const res = await adminLogin(
        req("/api/admin/auth/login", "POST", {
          body: { email: `u${i}@example.com`, password: "x" },
          ip: "198.51.100.77",
        }),
      );
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it("the ordinary login route refuses administrators", async () => {
    await makeAdmin("boss@example.com", "super_admin");
    const res = await plainLogin(
      req("/api/auth/login", "POST", { body: { email: "boss@example.com", password: PASSWORD } }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("admin_login_required");
  });

  it("resend enforces the cooldown", async () => {
    await makeAdmin("boss@example.com", "super_admin");
    const first = await adminLogin(
      req("/api/admin/auth/login", "POST", {
        body: { email: "boss@example.com", password: PASSWORD },
      }),
    );
    const { ref } = (await first.json()).data;
    const res = await adminResend(
      req("/api/admin/auth/resend", "POST", { body: { challenge: ref } }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });
});

describe("admin API authorization", () => {
  const protectedCalls: [string, string, () => Promise<Response>][] = [
    ["GET /api/admin/me", "me", () => me(req("/api/admin/me", "GET"))],
    ["GET /api/admin/users", "users", () => listUsers(req("/api/admin/users", "GET"))],
    [
      "POST /api/admin/users",
      "invite",
      () => invite(req("/api/admin/users", "POST", { body: {} })),
    ],
    ["GET /api/admin/roles", "roles", () => listRoles(req("/api/admin/roles", "GET"))],
    [
      "POST /api/admin/roles",
      "createRole",
      () => createRole(req("/api/admin/roles", "POST", { body: {} })),
    ],
    ["GET /api/admin/audit", "audit", () => audit(req("/api/admin/audit", "GET"))],
  ];

  it.each(protectedCalls)("%s refuses anonymous callers", async (_name, _id, call) => {
    expect((await call()).status).toBe(401);
  });

  it("refuses a signed-in customer on every admin route (403, not just hidden menus)", async () => {
    await User.create({
      email: "shopper@example.com",
      firstName: "S",
      lastName: "H",
      passwordHash: await hashPassword(PASSWORD),
      emailVerifiedAt: new Date(),
    });
    await User.updateOne(
      { email: "shopper@example.com" },
      { $set: { shopifyCustomerId: "gid://shopify/Customer/1" } },
    );
    const issued = await plainLogin(
      req("/api/auth/login", "POST", {
        body: { email: "shopper@example.com", password: PASSWORD },
      }),
    );
    const { ref } = (await issued.json()).data;
    const verified = await customerOtpVerify(
      req("/api/auth/otp/verify", "POST", { body: { challenge: ref, code: await latestCode() } }),
    );
    expect(verified.status).toBe(200);
    const token = (await verified.json()).data.accessToken as string;

    for (const call of [
      () => me(req("/api/admin/me", "GET", { token })),
      () => listUsers(req("/api/admin/users", "GET", { token })),
      () => listRoles(req("/api/admin/roles", "GET", { token })),
      () => audit(req("/api/admin/audit", "GET", { token })),
    ]) {
      const res = await call();
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("admin_required");
    }
  });

  it("an editor reaches /me but is denied users, roles and audit", async () => {
    await makeAdmin("ed@example.com", "editor");
    const token = await signIn("ed@example.com");
    const profile = await me(req("/api/admin/me", "GET", { token }));
    expect(profile.status).toBe(200);
    const body = (await profile.json()).data;
    expect(body.roleKey).toBe("editor");
    expect(body.permissions).toContain("blog:write");
    expect(body.permissions).not.toContain("users:manage");

    for (const call of [
      () => listUsers(req("/api/admin/users", "GET", { token })),
      () =>
        invite(
          req("/api/admin/users", "POST", {
            token,
            body: { email: "a@example.com", firstName: "A", lastName: "B", roleKey: "editor" },
          }),
        ),
      () => listRoles(req("/api/admin/roles", "GET", { token })),
      () => audit(req("/api/admin/audit", "GET", { token })),
    ]) {
      const res = await call();
      expect(res.status).toBe(403);
    }
  });

  it("a super admin runs the whole lifecycle: role, invite, edit, disable, audit", async () => {
    await makeAdmin("boss@example.com", "super_admin");
    const token = await signIn("boss@example.com");

    const created = await createRole(
      req("/api/admin/roles", "POST", {
        token,
        body: { key: "seo_writer", name: "SEO writer", permissions: ["blog:read", "blog:write"] },
      }),
    );
    expect(created.status).toBe(201);
    const duplicate = await createRole(
      req("/api/admin/roles", "POST", {
        token,
        body: { key: "seo_writer", name: "Again", permissions: [] },
      }),
    );
    expect(duplicate.status).toBe(409);
    const unknownPermission = await createRole(
      req("/api/admin/roles", "POST", {
        token,
        body: { key: "bad_role", name: "Bad", permissions: ["root:everything"] },
      }),
    );
    expect(unknownPermission.status).toBe(400);

    const invited = await invite(
      req("/api/admin/users", "POST", {
        token,
        body: { email: "writer@example.com", firstName: "W", lastName: "R", roleKey: "seo_writer" },
      }),
    );
    expect(invited.status).toBe(201);
    const userId = (await invited.json()).data.user.id as string;

    const roles = await (await listRoles(req("/api/admin/roles", "GET", { token }))).json();
    expect(roles.data.roles.find((r: { key: string }) => r.key === "seo_writer").userCount).toBe(1);

    const edited = await patchRole(
      req("/api/admin/roles/seo_writer", "PATCH", { token, body: { permissions: ["blog:read"] } }),
    );
    expect(edited.status).toBe(200);
    const builtIn = await patchRole(
      req("/api/admin/roles/editor", "PATCH", { token, body: { name: "Hacked" } }),
    );
    expect(builtIn.status).toBe(403);
    const inUse = await deleteRole(req("/api/admin/roles/seo_writer", "DELETE", { token }));
    expect(inUse.status).toBe(409);

    const disabled = await patchUser(
      req(`/api/admin/users/${userId}`, "PATCH", { token, body: { disabled: true } }),
    );
    expect(disabled.status).toBe(200);
    const badBody = await patchUser(
      req(`/api/admin/users/${userId}`, "PATCH", { token, body: {} }),
    );
    expect(badBody.status).toBe(400);

    const trail = await (await audit(req("/api/admin/audit?limit=100", "GET", { token }))).json();
    const actions = trail.data.entries.map((e: { action: string }) => e.action);
    for (const expected of [
      "auth.admin_login",
      "role.created",
      "user.admin_invited",
      "role.updated",
      "user.admin_status_changed",
    ]) {
      expect(actions).toContain(expected);
    }
    expect(JSON.stringify(trail)).not.toMatch(/passw|token|code"/i);
  });

  it("mutations require a same-origin request even with a valid token", async () => {
    await makeAdmin("boss@example.com", "super_admin");
    const token = await signIn("boss@example.com");
    const res = await createRole(
      req("/api/admin/roles", "POST", {
        token,
        origin: "https://evil.example",
        body: { key: "x_role", name: "X", permissions: [] },
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("customer sign-in routes", () => {
  it("login answers with a code handle, never a session, and verify opens the session", async () => {
    await User.create({
      email: "shopper@example.com",
      firstName: "S",
      lastName: "H",
      passwordHash: await hashPassword(PASSWORD),
      shopifyCustomerId: "gid://shopify/Customer/1",
    });
    const first = await plainLogin(
      req("/api/auth/login", "POST", {
        body: { email: "shopper@example.com", password: PASSWORD },
      }),
    );
    expect(first.status).toBe(200);
    expect(first.headers.get("set-cookie")).toBeNull();
    const data = (await first.json()).data;
    expect(data.accessToken).toBeUndefined();
    expect(data.ref).toBeTruthy();

    const wrong = await customerOtpVerify(
      req("/api/auth/otp/verify", "POST", { body: { challenge: data.ref, code: "000000" } }),
    );
    expect(wrong.status).toBe(400);
    const ok = await customerOtpVerify(
      req("/api/auth/otp/verify", "POST", {
        body: { challenge: data.ref, code: await latestCode() },
      }),
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  });
});
