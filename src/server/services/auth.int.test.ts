// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startTestDatabase } from "@/test/mongo";
import { disconnectDb } from "@/server/db/connection";
import { AuthToken } from "@/server/db/models/auth-token";
import { EmailJob } from "@/server/db/models/email-job";
import { User } from "@/server/db/models/user";
import { RateLimit } from "@/server/db/models/rate-limit";
import { rateLimiter } from "@/server/ratelimit";
import { signAccessToken, verifyAccessToken } from "@/server/auth/tokens";

import {
  authenticate,
  confirmEmailVerification,
  getProfile,
  loginUser,
  logoutAllSessions,
  logoutSession,
  refreshSession,
  registerUser,
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  updateProfile,
} from "./auth";

const meta = { ip: "203.0.113.7", userAgent: "vitest" };
const registration = {
  email: "ada@example.com",
  password: "correct horse battery",
  firstName: "Ada",
  lastName: "Lovelace",
  acceptsMarketing: false,
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
  await AuthToken.deleteMany({});
  await EmailJob.deleteMany({});
});

afterEach(() => vi.useRealTimers());

const expectCode = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toMatchObject({ code });
};

describe("database indexes", () => {
  it("guarantees unique emails and TTL cleanup regardless of environment", async () => {
    const userIndexes = await User.collection.indexes();
    expect(userIndexes.find((index) => index.key["email"] === 1)).toMatchObject({ unique: true });
    const limitIndexes = await RateLimit.collection.indexes();
    expect(limitIndexes.find((index) => index.key["expireAt"] === 1)).toMatchObject({
      expireAfterSeconds: 0,
    });
    expect(limitIndexes.find((index) => index.key["key"] === 1)).toMatchObject({ unique: true });
  });
});

describe("registration", () => {
  it("creates a customer, hashes the password and starts a session", async () => {
    const result = await registerUser(registration, meta);
    expect(result.user).toMatchObject({ email: "ada@example.com", role: "customer" });
    expect(result.expiresIn).toBe(900);
    expect(result.refreshMaxAge).toBe(604_800);

    const stored = await User.findOne({ email: "ada@example.com" })
      .select("+passwordHash +sessions")
      .lean();
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored?.passwordHash).not.toContain(registration.password);
    // Only a keyed hash of the refresh token is persisted, never the token itself.
    expect(stored?.sessions).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(result.refreshToken);
  });

  it("rejects a duplicate email", async () => {
    await registerUser(registration, meta);
    await expectCode(registerUser({ ...registration, firstName: "Other" }, meta), "email_taken");
  });
});

describe("login", () => {
  beforeEach(async () => {
    await registerUser(registration, meta);
  });

  it("signs in with correct credentials", async () => {
    const result = await loginUser(
      { email: "ada@example.com", password: registration.password },
      meta,
    );
    expect(result.accessToken).toBeTruthy();
    expect(
      await User.findOne({ email: "ada@example.com" })
        .select("+sessions")
        .lean()
        .then((u) => u?.sessions.length),
    ).toBe(2);
  });

  it("gives the same generic error for a wrong password and an unknown email", async () => {
    const wrong = await loginUser(
      { email: "ada@example.com", password: "nope-nope-nope" },
      meta,
    ).catch((e) => e);
    const unknown = await loginUser(
      { email: "ghost@example.com", password: "nope-nope-nope" },
      meta,
    ).catch((e) => e);
    expect(wrong).toMatchObject({ status: 401, code: "invalid_credentials" });
    expect(unknown).toMatchObject({
      status: 401,
      code: "invalid_credentials",
      message: wrong.message,
    });
  });

  it("locks the account after 5 failures, even for the right password, and recovers after the lock", async () => {
    for (let i = 0; i < 5; i++) {
      await expectCode(
        loginUser({ email: "ada@example.com", password: "bad-bad-bad-bad" }, meta),
        "invalid_credentials",
      );
    }
    await expectCode(
      loginUser({ email: "ada@example.com", password: registration.password }, meta),
      "account_locked",
    );

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    await expect(
      loginUser({ email: "ada@example.com", password: registration.password }, meta),
    ).resolves.toBeTruthy();
  });

  it("resets the failure counter after a successful login", async () => {
    for (let i = 0; i < 3; i++) {
      await expectCode(
        loginUser({ email: "ada@example.com", password: "bad-bad-bad-bad" }, meta),
        "invalid_credentials",
      );
    }
    await loginUser({ email: "ada@example.com", password: registration.password }, meta);
    const user = await User.findOne({ email: "ada@example.com" }).lean();
    expect(user?.failedLoginCount).toBe(0);
  });
});

describe("access tokens", () => {
  it("authenticates a valid token and carries session claims", async () => {
    const { accessToken, user } = await registerUser(registration, meta);
    const context = await authenticate(`Bearer ${accessToken}`);
    expect(context.userId).toBe(user.id);
    expect(context.role).toBe("customer");
    expect((await verifyAccessToken(accessToken)).sid).toBe(context.sid);
  });

  it("rejects missing, malformed and tampered tokens", async () => {
    const { accessToken } = await registerUser(registration, meta);
    await expectCode(authenticate(null), "unauthorized");
    await expectCode(authenticate("Basic abc"), "unauthorized");
    await expectCode(authenticate("Bearer not.a.jwt"), "invalid_token");
    await expectCode(authenticate(`Bearer ${accessToken.slice(0, -4)}AAAA`), "invalid_token");
  });

  it("rejects tokens signed with another secret or algorithm confusion", async () => {
    const { user } = await registerUser(registration, meta);
    const { SignJWT } = await import("jose");
    const forged = await new SignJWT({ sid: "x", role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuer("fernwood")
      .setAudience("fernwood-storefront")
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("c".repeat(48)));
    await expectCode(authenticate(`Bearer ${forged}`), "invalid_token");
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(
      JSON.stringify({
        sub: user.id,
        sid: "x",
        role: "admin",
        iss: "fernwood",
        aud: "fernwood-storefront",
      }),
    ).toString("base64url")}.`;
    await expectCode(authenticate(`Bearer ${none}`), "invalid_token");
  });

  it("expires after 15 minutes with a distinct code so clients know to refresh", async () => {
    const { accessToken } = await registerUser(registration, meta);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 15 * 60 * 1000 + 5_000);
    await expectCode(authenticate(`Bearer ${accessToken}`), "token_expired");
  });

  it("rejects a valid token whose session was revoked", async () => {
    const { accessToken, refreshToken } = await registerUser(registration, meta);
    await logoutSession(refreshToken);
    await expectCode(authenticate(`Bearer ${accessToken}`), "session_revoked");
  });

  it("takes the role from the database, so a demotion applies immediately", async () => {
    const { accessToken, user } = await registerUser(registration, meta);
    await User.updateOne({ _id: user.id }, { role: "admin" });
    expect((await authenticate(`Bearer ${accessToken}`)).role).toBe("admin");
    await User.updateOne({ _id: user.id }, { role: "customer" });
    expect((await authenticate(`Bearer ${accessToken}`)).role).toBe("customer");
  });

  it("rejects a token whose subject is not a valid id", async () => {
    const token = await signAccessToken({ sub: "not-an-object-id", sid: "x", role: "customer" });
    await expectCode(authenticate(`Bearer ${token}`), "invalid_token");
  });
});

describe("refresh token rotation", () => {
  it("rotates on every refresh and the new token works", async () => {
    const first = await registerUser(registration, meta);
    const second = await refreshSession(first.refreshToken, meta);
    expect(second.refreshToken).toBeTruthy();
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(authenticate(`Bearer ${second.accessToken}`)).resolves.toBeTruthy();
    const third = await refreshSession(second.refreshToken!, meta);
    expect(third.refreshToken).not.toBe(second.refreshToken);
  });

  it("tolerates an immediate replay (parallel tabs) by issuing only an access token", async () => {
    const first = await registerUser(registration, meta);
    await refreshSession(first.refreshToken, meta);
    const replay = await refreshSession(first.refreshToken, meta);
    expect(replay.accessToken).toBeTruthy();
    expect(replay.refreshToken).toBeUndefined();
  });

  it("treats a late replay of a rotated token as theft and revokes the session", async () => {
    const first = await registerUser(registration, meta);
    const second = await refreshSession(first.refreshToken, meta);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60_000);
    await expectCode(refreshSession(first.refreshToken, meta), "token_reuse");
    // The attacker's replay also kills the legitimate holder's chain: the session is gone.
    await expectCode(refreshSession(second.refreshToken!, meta), "invalid_refresh_token");
    await expectCode(authenticate(`Bearer ${second.accessToken}`), "session_revoked");
  });

  it("rejects unknown tokens", async () => {
    await expectCode(refreshSession("definitely-not-a-real-token", meta), "invalid_refresh_token");
  });

  it("expires after 7 days of inactivity", async () => {
    const { refreshToken } = await registerUser(registration, meta);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 7 * 24 * 3600 * 1000 + 1000);
    await expectCode(refreshSession(refreshToken, meta), "session_expired");
  });

  it("slides the 7 day window but never beyond 30 days in total", async () => {
    let { refreshToken } = await registerUser(registration, meta);
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    for (let day = 5; day <= 25; day += 5) {
      vi.setSystemTime(start + day * 24 * 3600 * 1000);
      refreshToken = (await refreshSession(refreshToken, meta)).refreshToken!;
    }
    vi.setSystemTime(start + 31 * 24 * 3600 * 1000);
    await expectCode(refreshSession(refreshToken, meta), "session_expired");
  });
});

describe("logout and session management", () => {
  it("logout revokes only that device and is idempotent", async () => {
    const phone = await registerUser(registration, meta);
    const laptop = await loginUser(
      { email: registration.email, password: registration.password },
      meta,
    );
    await logoutSession(phone.refreshToken);
    await logoutSession(phone.refreshToken);
    await expectCode(authenticate(`Bearer ${phone.accessToken}`), "session_revoked");
    await expect(authenticate(`Bearer ${laptop.accessToken}`)).resolves.toBeTruthy();
  });

  it("logout-all revokes every device", async () => {
    const a = await registerUser(registration, meta);
    const b = await loginUser({ email: registration.email, password: registration.password }, meta);
    await logoutAllSessions(a.user.id);
    await expectCode(authenticate(`Bearer ${a.accessToken}`), "session_revoked");
    await expectCode(authenticate(`Bearer ${b.accessToken}`), "session_revoked");
  });

  it("keeps at most 10 sessions per user, dropping the oldest", async () => {
    const first = await registerUser(registration, meta);
    for (let i = 0; i < 11; i++)
      await loginUser({ email: registration.email, password: registration.password }, meta);
    const user = await User.findById(first.user.id).select("+sessions").lean();
    expect(user?.sessions).toHaveLength(10);
    await expectCode(authenticate(`Bearer ${first.accessToken}`), "session_revoked");
  });
});

describe("profile", () => {
  it("reads and updates the profile, including clearing the phone number", async () => {
    const { user } = await registerUser(registration, meta);
    const updated = await updateProfile(user.id, {
      firstName: "Augusta",
      phone: "+44 20 7946 0958",
      acceptsMarketing: true,
    });
    expect(updated).toMatchObject({
      firstName: "Augusta",
      phone: "+44 20 7946 0958",
      acceptsMarketing: true,
    });
    const cleared = await updateProfile(user.id, { phone: "" });
    expect(cleared.phone).toBeUndefined();
    expect((await getProfile(user.id)).lastName).toBe("Lovelace");
  });

  it("never exposes the password hash or sessions", async () => {
    const { user } = await registerUser(registration, meta);
    const json = JSON.stringify(await getProfile(user.id));
    expect(json).not.toMatch(/passwordHash|sessions|argon2/);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit, then blocks with a retry hint, then resets after the window", async () => {
    for (let i = 1; i <= 3; i++) expect((await rateLimiter.consume("k", 3, 60)).allowed).toBe(true);
    const blocked = await rateLimiter.consume("k", 3, 60);
    expect(blocked).toMatchObject({ allowed: false, remaining: 0 });
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    expect((await rateLimiter.consume("k", 3, 60)).allowed).toBe(true);
  });

  it("isolates keys and is safe under concurrency", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => rateLimiter.consume("burst", 4, 60)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(4);
    expect((await rateLimiter.consume("other", 4, 60)).allowed).toBe(true);
  });
});

const tokenFrom = async (template: string): Promise<string> => {
  const job = await EmailJob.findOne({ template }).sort({ createdAt: -1 }).lean();
  const url = new URL(String((job?.data as { url?: string } | undefined)?.url));
  expect(url.origin).toBe("https://fernwood.test"); // links come from SITE_URL, never from request headers
  return url.searchParams.get("token")!;
};

describe("email verification", () => {
  it("registration queues a verification email and the account starts unverified", async () => {
    const { user } = await registerUser(registration, meta);
    expect(user.emailVerified).toBe(false);
    const job = await EmailJob.findOne({ template: "verify-email" }).lean();
    expect(job).toMatchObject({ to: "ada@example.com", status: "pending" });
  });

  it("confirms with the emailed token exactly once", async () => {
    const { user, accessToken } = await registerUser(registration, meta);
    const token = await tokenFrom("verify-email");

    await confirmEmailVerification(token);
    expect((await getProfile(user.id)).emailVerified).toBe(true);
    await expectCode(confirmEmailVerification(token), "invalid_token"); // single use
    void accessToken;
  });

  it("stores only a hash of the token and rejects wrong, expired and cross-purpose tokens", async () => {
    await registerUser(registration, meta);
    const token = await tokenFrom("verify-email");
    expect(JSON.stringify(await AuthToken.find().lean())).not.toContain(token);

    await expectCode(confirmEmailVerification("x".repeat(43)), "invalid_token");
    await expectCode(resetPassword(token, "brand-new-password"), "invalid_token"); // wrong type

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 25 * 3600 * 1000);
    await expectCode(confirmEmailVerification(token), "invalid_token");
  });

  it("re-sending invalidates the previous link and is a no-op once verified", async () => {
    const { user } = await registerUser(registration, meta);
    const first = await tokenFrom("verify-email");
    await requestEmailVerification(user.id);
    const second = await tokenFrom("verify-email");
    expect(second).not.toBe(first);
    await expectCode(confirmEmailVerification(first), "invalid_token");

    await confirmEmailVerification(second);
    const before = await EmailJob.countDocuments({ template: "verify-email" });
    await requestEmailVerification(user.id);
    expect(await EmailJob.countDocuments({ template: "verify-email" })).toBe(before);
  });
});

describe("password reset", () => {
  beforeEach(async () => {
    await registerUser(registration, meta);
    await EmailJob.deleteMany({});
  });

  it("does nothing, visibly or otherwise, for an unknown email", async () => {
    await expect(requestPasswordReset("ghost@example.com")).resolves.toBeUndefined();
    expect(await EmailJob.countDocuments()).toBe(0);
    expect(await AuthToken.countDocuments({ type: "reset_password" })).toBe(0);
  });

  it("changes the password, signs out every device, clears the lockout and notifies the owner", async () => {
    const second = await loginUser(
      { email: registration.email, password: registration.password },
      meta,
    );
    for (let i = 0; i < 5; i++) {
      await loginUser({ email: registration.email, password: "wrong-wrong-wrong" }, meta).catch(
        () => undefined,
      );
    }
    await expectCode(
      loginUser({ email: registration.email, password: registration.password }, meta),
      "account_locked",
    );

    await requestPasswordReset(registration.email);
    const token = await tokenFrom("reset-password");
    await resetPassword(token, "a-much-better-password");

    await expectCode(authenticate(`Bearer ${second.accessToken}`), "session_revoked");
    await expectCode(
      loginUser({ email: registration.email, password: registration.password }, meta),
      "invalid_credentials",
    );
    const fresh = await loginUser(
      { email: registration.email, password: "a-much-better-password" },
      meta,
    );
    expect(fresh.user.emailVerified).toBe(true); // reaching the mailbox proves ownership
    expect(
      await EmailJob.countDocuments({ template: "password-changed", to: registration.email }),
    ).toBe(1);
  });

  it("tokens are single use, expire after 1 hour and a newer request invalidates older links", async () => {
    await requestPasswordReset(registration.email);
    const old = await tokenFrom("reset-password");
    await requestPasswordReset(registration.email);
    const current = await tokenFrom("reset-password");
    await expectCode(resetPassword(old, "a-much-better-password"), "invalid_token");

    await resetPassword(current, "a-much-better-password");
    await expectCode(resetPassword(current, "another-password-1"), "invalid_token");

    await requestPasswordReset(registration.email);
    const expiring = await tokenFrom("reset-password");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    await expectCode(resetPassword(expiring, "yet-another-password"), "invalid_token");
  });

  it("a verification token cannot reset a password", async () => {
    await registerUser({ ...registration, email: "other@example.com" }, meta);
    const verify = await tokenFrom("verify-email");
    await expectCode(resetPassword(verify, "a-much-better-password"), "invalid_token");
  });
});
