// @vitest-environment node
import { NextRequest } from "next/server";
import type { MongoMemoryServer } from "mongodb-memory-server";
import {
  type MockInstance,
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { hashPassword } from "@/server/auth/password";
import { requireAdmin } from "@/server/auth/guards";
import { disconnectDb } from "@/server/db/connection";
import { AuditLog } from "@/server/db/models/audit-log";
import { AuthToken } from "@/server/db/models/auth-token";
import { EmailJob } from "@/server/db/models/email-job";
import { OtpChallenge } from "@/server/db/models/otp-challenge";
import { RateLimit } from "@/server/db/models/rate-limit";
import { Role } from "@/server/db/models/role";
import { User } from "@/server/db/models/user";
import { resetEnvCache } from "@/server/config/env";
import { startTestDatabase } from "@/test/mongo";
import * as customerSync from "@/server/services/customer-sync";

import {
  completeAdminLogin,
  completeCustomerOtp,
  startAdminLogin,
  startCustomerLogin,
} from "./admin-auth";
import { inviteAdmin, listAdminUsers, updateAdminUser } from "./admin-users";
import { loginWithCode } from "@/test/login";

import { authenticate, registerUser } from "./auth";
import { listAudit } from "./audit";
import { issueOtp, resendOtp, verifyOtp } from "./otp";
import { createRole, deleteRole, resolvePermissions, updateRole } from "./rbac";

const meta = { ip: "203.0.113.9", userAgent: "vitest" };
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

async function makeUser(email: string, adminRole?: string) {
  const user = await User.create({
    email,
    firstName: "Ada",
    lastName: "Lovelace",
    passwordHash: await hashPassword(PASSWORD),
    role: adminRole === "super_admin" ? "admin" : adminRole ? "staff" : "customer",
    ...(adminRole ? { adminRole } : {}),
  });
  return user.toObject();
}

/** The code only ever exists in the email; read it back from the outbox like the recipient would. */
async function latestCode(): Promise<string> {
  const job = await EmailJob.findOne({ template: "otp-code" }).sort({ createdAt: -1 }).lean();
  const code = (job?.data as { code?: string } | undefined)?.code;
  if (!code) throw new Error("no OTP email queued");
  return code;
}

const wrongCode = (code: string) => (code === "000000" ? "111111" : "000000");

const requestWith = (accessToken: string) =>
  new NextRequest("https://fernwood.test/api/admin/me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });

async function signIn(email: string): Promise<{ accessToken: string; userId: string }> {
  await startAdminLogin({ email, password: PASSWORD }, meta);
  const result = await completeAdminLogin(
    (await OtpChallenge.findOne({}).sort({ createdAt: -1 }).lean())?.ref ?? "",
    await latestCode(),
    meta,
  );
  return { accessToken: result.accessToken, userId: result.user.id };
}

describe("one-time codes", () => {
  it("accepts the right code once, then refuses replay", async () => {
    const user = await makeUser("a@example.com");
    const { ref } = await issueOtp(user, "customer_login");
    const code = await latestCode();
    expect(String(await verifyOtp(ref, code, "customer_login"))).toBe(String(user._id));
    await expect(verifyOtp(ref, code, "customer_login")).rejects.toMatchObject({
      code: "invalid_code",
    });
  });

  it("never stores the code in plain text", async () => {
    const user = await makeUser("a@example.com");
    const { ref } = await issueOtp(user, "customer_login");
    const code = await latestCode();
    const row = await OtpChallenge.findOne({ ref }).lean();
    expect(JSON.stringify(row)).not.toContain(code);
    expect(row?.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("locks the challenge after 5 attempts, even for the correct code afterwards", async () => {
    const user = await makeUser("a@example.com");
    const { ref } = await issueOtp(user, "customer_login");
    const code = await latestCode();
    for (let i = 0; i < 5; i++) {
      await expect(verifyOtp(ref, wrongCode(code), "customer_login")).rejects.toMatchObject({
        code: "invalid_code",
      });
    }
    await expect(verifyOtp(ref, code, "customer_login")).rejects.toMatchObject({
      code: "invalid_code",
    });
  });

  it("holds the cap under parallel guessing", async () => {
    const user = await makeUser("a@example.com");
    const { ref } = await issueOtp(user, "customer_login");
    const code = await latestCode();
    await Promise.allSettled(
      Array.from({ length: 20 }, () => verifyOtp(ref, wrongCode(code), "customer_login")),
    );
    expect((await OtpChallenge.findOne({ ref }).lean())?.attempts).toBe(5);
  });

  it("rejects an expired code", async () => {
    const user = await makeUser("a@example.com");
    const { ref } = await issueOtp(user, "customer_login");
    const code = await latestCode();
    await OtpChallenge.updateOne({ ref }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(verifyOtp(ref, code, "customer_login")).rejects.toMatchObject({
      code: "invalid_code",
    });
  });

  it("does not accept a code for a different purpose", async () => {
    const user = await makeUser("a@example.com");
    const { ref } = await issueOtp(user, "customer_login");
    await expect(verifyOtp(ref, await latestCode(), "admin_login")).rejects.toMatchObject({
      code: "invalid_code",
    });
  });

  it("voids the previous challenge when a new one starts", async () => {
    const user = await makeUser("a@example.com");
    const first = await issueOtp(user, "customer_login");
    const firstCode = await latestCode();
    await issueOtp(user, "customer_login");
    await expect(verifyOtp(first.ref, firstCode, "customer_login")).rejects.toMatchObject({
      code: "invalid_code",
    });
  });

  it("limits resend by cooldown and total sends, replacing the old code, without resetting attempts", async () => {
    const user = await makeUser("a@example.com");
    const { ref } = await issueOtp(user, "customer_login");
    const original = await latestCode();
    await expect(resendOtp(ref, "customer_login")).rejects.toMatchObject({
      code: "otp_resend_wait",
    });

    await verifyOtp(ref, wrongCode(original), "customer_login").catch(() => undefined);
    const cooled = () =>
      OtpChallenge.updateOne({ ref }, { $set: { lastSentAt: new Date(Date.now() - 61_000) } });
    await cooled();
    await resendOtp(ref, "customer_login");
    await cooled();
    await resendOtp(ref, "customer_login");
    await cooled();
    await expect(resendOtp(ref, "customer_login")).rejects.toMatchObject({
      code: "otp_resend_limit",
    });

    const row = await OtpChallenge.findOne({ ref }).lean();
    expect(row?.attempts).toBe(1);
    expect(row?.sendCount).toBe(3);
    // The first code is dead once a new one was issued (unless the random codes collide).
    const latest = await latestCode();
    if (latest !== original) {
      await expect(verifyOtp(ref, original, "customer_login")).rejects.toMatchObject({
        code: "invalid_code",
      });
    }
  });
});

describe("admin sign-in", () => {
  it("needs password AND code; the code step opens the session with the live role", async () => {
    await makeUser("boss@example.com", "super_admin");
    const issued = await startAdminLogin({ email: "boss@example.com", password: PASSWORD }, meta);
    expect(issued.ref).toBeTruthy();
    const result = await completeAdminLogin(issued.ref, await latestCode(), meta);
    expect(result.user.email).toBe("boss@example.com");
    expect((await authenticate(`Bearer ${result.accessToken}`)).adminRole).toBe("super_admin");
    expect(await AuditLog.countDocuments({ action: "auth.admin_login" })).toBe(1);
  });

  it("refuses a wrong password without sending any code", async () => {
    await makeUser("boss@example.com", "super_admin");
    await expect(
      startAdminLogin({ email: "boss@example.com", password: "nope nope nope" }, meta),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
    expect(await EmailJob.countDocuments({ template: "otp-code" })).toBe(0);
  });

  it("answers a non-admin exactly like a wrong password (no admin discovery)", async () => {
    await makeUser("shopper@example.com");
    await expect(
      startAdminLogin({ email: "shopper@example.com", password: PASSWORD }, meta),
    ).rejects.toMatchObject({ code: "invalid_credentials", status: 401 });
    await expect(
      startAdminLogin({ email: "ghost@example.com", password: PASSWORD }, meta),
    ).rejects.toMatchObject({ code: "invalid_credentials", status: 401 });
    expect(await EmailJob.countDocuments({ template: "otp-code" })).toBe(0);
  });

  it("closes the password-only backdoor: the normal login endpoint never opens a session for an admin", async () => {
    await makeUser("boss@example.com", "super_admin");
    await expect(
      loginWithCode({ email: "boss@example.com", password: PASSWORD }, meta),
    ).rejects.toMatchObject({ code: "admin_login_required", status: 403 });
  });

  it("refuses sign-in for a disabled admin, and a code issued before the role was revoked", async () => {
    const admin = await makeUser("boss@example.com", "super_admin");
    const issued = await startAdminLogin({ email: "boss@example.com", password: PASSWORD }, meta);
    const code = await latestCode();
    await User.updateOne(
      { _id: admin._id },
      { $unset: { adminRole: 1 }, $set: { role: "customer" } },
    );
    await expect(completeAdminLogin(issued.ref, code, meta)).rejects.toMatchObject({
      code: "invalid_code",
    });

    await User.updateOne(
      { _id: admin._id },
      { $set: { adminRole: "super_admin", disabledAt: new Date() } },
    );
    await expect(
      startAdminLogin({ email: "boss@example.com", password: PASSWORD }, meta),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("locks the account after repeated wrong passwords (shared with customer login)", async () => {
    await makeUser("boss@example.com", "super_admin");
    for (let i = 0; i < 5; i++) {
      await startAdminLogin(
        { email: "boss@example.com", password: "wrong wrong wrong" },
        meta,
      ).catch(() => undefined);
    }
    await expect(
      startAdminLogin({ email: "boss@example.com", password: PASSWORD }, meta),
    ).rejects.toMatchObject({ code: "account_locked" });
  });
});

describe("customer sign-in (password, then code)", () => {
  const customer = {
    email: "c@example.com",
    password: PASSWORD,
    firstName: "C",
    lastName: "D",
    acceptsMarketing: false,
  };

  // No test here may reach the real Shopify: the link repair is replaced by a recorded stub.
  let syncSpy: MockInstance<typeof customerSync.syncCustomer>;
  beforeEach(() => {
    syncSpy = vi
      .spyOn(customerSync, "syncCustomer")
      .mockResolvedValue({ marketingSubscriberId: null });
  });
  afterEach(() => syncSpy.mockRestore());

  it("emails a code only after the password is right, and a session only after the code", async () => {
    await registerUser(customer, meta);
    await EmailJob.deleteMany({ template: "otp-code" });

    await expect(
      startCustomerLogin({ email: customer.email, password: "wrong wrong wrong" }),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
    expect(await EmailJob.countDocuments({ template: "otp-code" })).toBe(0);

    const issued = await startCustomerLogin({ email: customer.email, password: PASSWORD });
    expect(await EmailJob.countDocuments({ template: "otp-code", to: customer.email })).toBe(1);
    const result = await completeCustomerOtp(issued.ref, await latestCode(), meta);
    expect(result.user.emailVerified).toBe(true);
  });

  it("sends nothing for unknown emails, disabled accounts and administrators", async () => {
    await makeUser("boss@example.com", "super_admin");
    await makeUser("off@example.com");
    await User.updateOne({ email: "off@example.com" }, { $set: { disabledAt: new Date() } });

    await expect(
      startCustomerLogin({ email: "ghost@example.com", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
    await expect(
      startCustomerLogin({ email: "off@example.com", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
    await expect(
      startCustomerLogin({ email: "boss@example.com", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "admin_login_required", status: 403 });
    expect(await EmailJob.countDocuments({ template: "otp-code" })).toBe(0);
  });

  it("a customer code can't open an admin session or be used for another purpose", async () => {
    await registerUser(customer, meta);
    const issued = await startCustomerLogin({ email: customer.email, password: PASSWORD });
    await expect(completeAdminLogin(issued.ref, await latestCode(), meta)).rejects.toMatchObject({
      code: "invalid_code",
    });
  });

  describe("Shopify link (GID)", () => {
    afterEach(() => {
      vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "shpat_admin_token_for_tests");
      resetEnvCache();
    });

    it("is not required where Shopify Admin isn't configured", async () => {
      vi.stubEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN", "");
      resetEnvCache();
      await registerUser(customer, meta);
      await expect(
        startCustomerLogin({ email: customer.email, password: PASSWORD }),
      ).resolves.toMatchObject({ ref: expect.any(String) });
    });

    it("lets a linked account straight through without calling Shopify", async () => {
      await registerUser(customer, meta);
      await User.updateOne(
        { email: customer.email },
        { $set: { shopifyCustomerId: "gid://shopify/Customer/1" } },
      );
      await startCustomerLogin({ email: customer.email, password: PASSWORD });
      expect(syncSpy).not.toHaveBeenCalled();
    });

    it("repairs a missing link on the spot, then sends the code", async () => {
      await registerUser(customer, meta);
      await User.updateOne({ email: customer.email }, { $set: { emailVerifiedAt: new Date() } });
      syncSpy.mockImplementation(async (userId) => {
        await User.updateOne(
          { _id: userId },
          { $set: { shopifyCustomerId: "gid://shopify/Customer/9" } },
        );
        return { marketingSubscriberId: null };
      });
      await expect(
        startCustomerLogin({ email: customer.email, password: PASSWORD }),
      ).resolves.toBeTruthy();
      expect(syncSpy).toHaveBeenCalledOnce();
    });

    it("waits (503, no code) when a verified account can't be linked or Shopify is down", async () => {
      await registerUser(customer, meta);
      await User.updateOne({ email: customer.email }, { $set: { emailVerifiedAt: new Date() } });
      await EmailJob.deleteMany({ template: "otp-code" });

      syncSpy.mockRejectedValue(new Error("shopify down"));
      await expect(
        startCustomerLogin({ email: customer.email, password: PASSWORD }),
      ).rejects.toMatchObject({ code: "account_setup_pending", status: 503 });
      syncSpy.mockResolvedValue({ marketingSubscriberId: null });
      await expect(
        startCustomerLogin({ email: customer.email, password: PASSWORD }),
      ).rejects.toMatchObject({ code: "account_setup_pending" });
      expect(await EmailJob.countDocuments({ template: "otp-code" })).toBe(0);
    });

    it("lets an unproven mailbox continue: the code proves it, then the link is made", async () => {
      await registerUser(customer, meta);
      await expect(
        startCustomerLogin({ email: customer.email, password: PASSWORD }),
      ).resolves.toBeTruthy();
    });
  });
});

describe("RBAC", () => {
  it("rejects missing, malformed and customer tokens; admits an admin", async () => {
    const customer = await registerUser(
      {
        email: "c@example.com",
        password: PASSWORD,
        firstName: "C",
        lastName: "D",
        acceptsMarketing: false,
      },
      meta,
    );
    await expect(
      requireAdmin(new NextRequest("https://fernwood.test/api/admin/me")),
    ).rejects.toMatchObject({ status: 401 });
    await expect(requireAdmin(requestWith("garbage"))).rejects.toMatchObject({ status: 401 });
    await expect(requireAdmin(requestWith(customer.accessToken))).rejects.toMatchObject({
      status: 403,
      code: "admin_required",
    });

    await makeUser("boss@example.com", "super_admin");
    const { accessToken } = await signIn("boss@example.com");
    const ctx = await requireAdmin(requestWith(accessToken), "users:manage");
    expect(ctx.permissions.has("users:manage")).toBe(true);
  });

  it("enforces permissions on the server: an editor can publish but not manage users", async () => {
    await makeUser("ed@example.com", "editor");
    const { accessToken } = await signIn("ed@example.com");
    await expect(requireAdmin(requestWith(accessToken), "blog:publish")).resolves.toBeTruthy();
    await expect(requireAdmin(requestWith(accessToken), "users:manage")).rejects.toMatchObject({
      status: 403,
      code: "permission_denied",
    });
  });

  it("applies demotion and disabling on the very next request (roles are read from the database)", async () => {
    const editor = await makeUser("ed@example.com", "editor");
    const { accessToken } = await signIn("ed@example.com");
    await User.updateOne({ _id: editor._id }, { $unset: { adminRole: 1 } });
    await expect(requireAdmin(requestWith(accessToken))).rejects.toMatchObject({
      code: "admin_required",
    });
    await User.updateOne({ _id: editor._id }, { $set: { adminRole: "editor", sessions: [] } });
    await expect(requireAdmin(requestWith(accessToken))).rejects.toMatchObject({
      code: "session_revoked",
    });
  });

  it("fails closed for a role that no longer exists", async () => {
    expect((await resolvePermissions("deleted_role")).size).toBe(0);
    expect((await resolvePermissions("__proto__")).size).toBe(0);
  });

  it("lets a custom role carry exactly the assigned modules", async () => {
    await makeUser("boss@example.com", "super_admin");
    const { accessToken } = await signIn("boss@example.com");
    const actor = await requireAdmin(requestWith(accessToken));
    await createRole(actor.permissions, {
      key: "seo_writer",
      name: "SEO writer",
      description: "",
      permissions: ["blog:read", "blog:write"],
    });
    await makeUser("seo@example.com", "seo_writer");
    const seo = await signIn("seo@example.com");
    await expect(requireAdmin(requestWith(seo.accessToken), "blog:write")).resolves.toBeTruthy();
    await expect(requireAdmin(requestWith(seo.accessToken), "blog:publish")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("blocks privilege escalation through roles and invitations", async () => {
    await makeUser("ed@example.com", "editor");
    const { accessToken } = await signIn("ed@example.com");
    const editor = await requireAdmin(requestWith(accessToken));
    await expect(
      createRole(editor.permissions, {
        key: "sneaky",
        name: "Sneaky",
        description: "",
        permissions: ["users:manage"],
      }),
    ).rejects.toMatchObject({ code: "privilege_escalation" });
    await expect(
      inviteAdmin(
        { ...editor, permissions: new Set([...editor.permissions, "users:manage"]) },
        { email: "n@example.com", firstName: "N", lastName: "N", roleKey: "super_admin" },
        meta.ip,
      ),
    ).rejects.toMatchObject({ code: "privilege_escalation" });
  });

  it("protects built-in roles and roles in use", async () => {
    await makeUser("boss@example.com", "super_admin");
    const { accessToken } = await signIn("boss@example.com");
    const actor = await requireAdmin(requestWith(accessToken));
    await expect(updateRole(actor.permissions, "editor", { name: "x" })).rejects.toMatchObject({
      code: "system_role",
    });
    await expect(deleteRole("super_admin")).rejects.toMatchObject({ code: "system_role" });
    await expect(
      createRole(actor.permissions, { key: "editor", name: "x", description: "", permissions: [] }),
    ).rejects.toMatchObject({ code: "role_key_reserved" });

    await createRole(actor.permissions, {
      key: "temp",
      name: "Temp",
      description: "",
      permissions: [],
    });
    await makeUser("t@example.com", "temp");
    await expect(deleteRole("temp")).rejects.toMatchObject({ code: "role_in_use" });
  });
});

describe("administrator management", () => {
  async function superAdmin() {
    const user = await makeUser("boss@example.com", "super_admin");
    const { accessToken } = await signIn("boss@example.com");
    return { user, ctx: await requireAdmin(requestWith(accessToken)) };
  }

  it("invites a new editor by email with a one-time set-password link and audits it", async () => {
    const { ctx } = await superAdmin();
    const invited = await inviteAdmin(
      ctx,
      { email: "new@example.com", firstName: "New", lastName: "Editor", roleKey: "editor" },
      meta.ip,
    );
    expect(invited.roleKey).toBe("editor");
    const job = await EmailJob.findOne({ template: "admin-invite" }).lean();
    expect(job?.to).toBe("new@example.com");
    expect((job?.data as { url: string }).url).toContain("/reset-password?token=");
    expect(await AuthToken.countDocuments({ type: "reset_password" })).toBe(1);
    expect(await AuditLog.countDocuments({ action: "user.admin_invited" })).toBe(1);
    // The invitee has no usable password until the link is used.
    await expect(
      startAdminLogin({ email: "new@example.com", password: PASSWORD }, meta),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
  });

  it("neutralises the password and sessions of an existing customer who is promoted", async () => {
    const { ctx } = await superAdmin();
    await registerUser(
      {
        email: "squatter@example.com",
        password: PASSWORD,
        firstName: "S",
        lastName: "Q",
        acceptsMarketing: false,
      },
      meta,
    );
    await inviteAdmin(
      ctx,
      { email: "squatter@example.com", firstName: "S", lastName: "Q", roleKey: "editor" },
      meta.ip,
    );
    await expect(
      loginWithCode({ email: "squatter@example.com", password: PASSWORD }, meta),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
    const row = await User.findOne({ email: "squatter@example.com" }).select("+sessions").lean();
    expect(row?.sessions).toHaveLength(0);
  });

  it("refuses to invite someone who is already an admin", async () => {
    const { ctx } = await superAdmin();
    await expect(
      inviteAdmin(
        ctx,
        { email: "boss@example.com", firstName: "B", lastName: "B", roleKey: "editor" },
        meta.ip,
      ),
    ).rejects.toMatchObject({ code: "already_admin" });
  });

  it("changes roles, disables (revoking sessions at once) and re-enables", async () => {
    const { ctx } = await superAdmin();
    const editor = await makeUser("ed@example.com", "editor");
    const session = await signIn("ed@example.com");

    await updateAdminUser(ctx, String(editor._id), { disabled: true }, meta.ip);
    await expect(authenticate(`Bearer ${session.accessToken}`)).rejects.toMatchObject({
      code: "session_revoked",
    });
    await expect(
      startAdminLogin({ email: "ed@example.com", password: PASSWORD }, meta),
    ).rejects.toMatchObject({ code: "invalid_credentials" });

    await updateAdminUser(
      ctx,
      String(editor._id),
      { disabled: false, roleKey: "super_admin" },
      meta.ip,
    );
    expect((await listAdminUsers()).find((u) => u.email === "ed@example.com")?.roleKey).toBe(
      "super_admin",
    );
    expect(await AuditLog.countDocuments({ action: "user.admin_status_changed" })).toBe(2);
  });

  it("removing admin access turns the account back into a plain customer", async () => {
    const { ctx } = await superAdmin();
    const editor = await makeUser("ed@example.com", "editor");
    await updateAdminUser(ctx, String(editor._id), { roleKey: null }, meta.ip);
    const row = await User.findById(editor._id).lean();
    expect(row?.adminRole).toBeUndefined();
    expect(row?.role).toBe("customer");
  });

  it("never lets you change yourself, an unknown user, or remove the last Super Admin", async () => {
    const { user, ctx } = await superAdmin();
    await expect(
      updateAdminUser(ctx, String(user._id), { disabled: true }, meta.ip),
    ).rejects.toMatchObject({ code: "self_change" });
    await expect(
      updateAdminUser(ctx, "64b7f0c2a1b2c3d4e5f60718", { disabled: true }, meta.ip),
    ).rejects.toMatchObject({ code: "user_not_found" });

    const second = await makeUser("second@example.com", "super_admin");
    await updateAdminUser(ctx, String(second._id), { disabled: true }, meta.ip);
    // Re-enable and demote the only OTHER super admin is fine; but with the actor as the sole active one, an
    // attempt by a second actor to disable them must fail.
    await updateAdminUser(ctx, String(second._id), { disabled: false }, meta.ip);
    await User.updateOne({ _id: user._id }, { $set: { disabledAt: new Date() } });
    await expect(
      updateAdminUser(
        { ...ctx, userId: String(user._id) },
        String(second._id),
        { disabled: true },
        meta.ip,
      ),
    ).rejects.toMatchObject({ code: "last_super_admin" });
  });

  it("stops an editor-level manager from touching a more powerful admin", async () => {
    const { user } = await superAdmin();
    const manager = await makeUser("mgr@example.com", "editor");
    const weakCtx = {
      userId: String(manager._id),
      sid: "s",
      adminRole: "editor",
      permissions: new Set(["users:manage" as const, "blog:read" as const]),
    };
    await expect(
      updateAdminUser(weakCtx, String(user._id), { disabled: true }, meta.ip),
    ).rejects.toMatchObject({ code: "privilege_escalation" });
  });

  it("lists the audit trail newest first with a cursor", async () => {
    const { ctx } = await superAdmin();
    await inviteAdmin(
      ctx,
      { email: "a@example.com", firstName: "A", lastName: "A", roleKey: "editor" },
      meta.ip,
    );
    const page = await listAudit({ limit: 1 });
    expect(page.entries).toHaveLength(1);
    expect(page.nextCursor).toBeTruthy();
    const rest = await listAudit({ limit: 50, before: new Date(page.nextCursor ?? "") });
    expect(rest.entries.length).toBeGreaterThan(0);
  });
});
