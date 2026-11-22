import "server-only";

import { randomBytes } from "node:crypto";

import type { AdminUserView } from "@/lib/admin-types";
import { hashPassword } from "@/server/auth/password";
import type { AdminContext } from "@/server/auth/guards";
import { siteUrl } from "@/server/config/env";
import { connectDb } from "@/server/db/connection";
import { type Role, User } from "@/server/db/models/user";
import { enqueueEmail } from "@/server/email/outbox";
import { badRequest, conflict, forbidden } from "@/server/http/errors";
import { recordAudit } from "@/server/services/audit";
import { issueAuthToken } from "@/server/services/auth-tokens";
import { assertCanGrant, listRoles, resolvePermissions, roleExists } from "@/server/services/rbac";

export type { AdminUserView };

const systemRoleField = (roleKey: string): Role => (roleKey === "super_admin" ? "admin" : "staff");

export async function listAdminUsers(): Promise<AdminUserView[]> {
  await connectDb();
  const users = await User.find({ adminRole: { $exists: true } })
    .sort({ createdAt: 1 })
    .lean();
  return users.map((user) => ({
    id: String(user._id),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleKey: user.adminRole ?? "",
    disabled: Boolean(user.disabledAt),
    emailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt.toISOString(),
  }));
}

/**
 * Creates (or promotes) an admin and emails a set-password link. The password is replaced by a random
 * unusable one and all sessions are dropped, so whoever may have registered that address earlier can't
 * keep access: only the mailbox owner, via the emailed link, can set a password.
 */
export async function inviteAdmin(
  actor: AdminContext,
  input: { email: string; firstName: string; lastName: string; roleKey: string },
  ip: string,
): Promise<AdminUserView> {
  if (!(await roleExists(input.roleKey))) throw badRequest("Unknown role.", "role_not_found");
  assertCanGrant(actor.permissions, [...(await resolvePermissions(input.roleKey))]);

  await connectDb();
  const existing = await User.findOne({ email: input.email }).lean();
  if (existing?.adminRole) throw conflict("This person is already an admin.", "already_admin");

  const unusablePassword = await hashPassword(randomBytes(32).toString("base64url"));
  const fields = {
    adminRole: input.roleKey,
    role: systemRoleField(input.roleKey),
    passwordHash: unusablePassword,
    sessions: [],
  };
  const user = existing
    ? await User.findByIdAndUpdate(
        existing._id,
        { $set: fields, $unset: { disabledAt: 1 } },
        { returnDocument: "after" },
      ).lean()
    : (
        await User.create({
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          ...fields,
        })
      ).toObject();
  if (!user) throw badRequest("Could not create the invitation.", "invite_failed");

  const token = await issueAuthToken(user._id, "reset_password");
  const roleName = (await listRoles()).find((role) => role.key === input.roleKey)?.name ?? "Admin";
  await enqueueEmail("admin-invite", user.email, {
    firstName: user.firstName,
    roleName,
    url: `${siteUrl()}/reset-password?token=${encodeURIComponent(token)}`,
  });
  await recordAudit({
    action: "user.admin_invited",
    actorId: actor.userId,
    targetType: "user",
    targetId: String(user._id),
    meta: { role: input.roleKey, promoted: Boolean(existing) },
    ip,
  });
  return {
    id: String(user._id),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleKey: input.roleKey,
    disabled: false,
    emailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt.toISOString(),
  };
}

/** Number of enabled super admins: the system must never be left without one. */
const activeSuperAdmins = () =>
  User.countDocuments({ adminRole: "super_admin", disabledAt: { $exists: false } });

/**
 * Changes an admin's role (`roleKey`; `null` removes admin access) or enables/disables the account.
 * Guards: not yourself, not someone more powerful than you, no escalation, never the last super admin.
 */
export async function updateAdminUser(
  actor: AdminContext,
  targetId: string,
  patch: { roleKey?: string | null | undefined; disabled?: boolean | undefined },
  ip: string,
): Promise<void> {
  if (targetId === actor.userId) {
    throw forbidden("You can't change your own role or status.", "self_change");
  }
  await connectDb();
  const target = await User.findOne({ _id: targetId, adminRole: { $exists: true } }).lean();
  if (!target?.adminRole) throw badRequest("Admin user not found.", "user_not_found");

  assertCanGrant(actor.permissions, [...(await resolvePermissions(target.adminRole))]);
  const losingSuperAdmin =
    target.adminRole === "super_admin" &&
    !target.disabledAt &&
    (patch.disabled === true || (patch.roleKey !== undefined && patch.roleKey !== "super_admin"));
  if (losingSuperAdmin && (await activeSuperAdmins()) <= 1) {
    throw conflict("There must always be one active Super Admin.", "last_super_admin");
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};

  if (patch.roleKey === null) {
    unset["adminRole"] = 1;
    set["role"] = "customer";
    set["sessions"] = [];
  } else if (patch.roleKey !== undefined) {
    if (!(await roleExists(patch.roleKey))) throw badRequest("Unknown role.", "role_not_found");
    assertCanGrant(actor.permissions, [...(await resolvePermissions(patch.roleKey))]);
    set["adminRole"] = patch.roleKey;
    set["role"] = systemRoleField(patch.roleKey);
  }
  if (patch.disabled === true) {
    set["disabledAt"] = new Date();
    set["sessions"] = [];
  } else if (patch.disabled === false) {
    unset["disabledAt"] = 1;
  }

  await User.updateOne(
    { _id: targetId },
    {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
  );
  await recordAudit({
    action: patch.disabled !== undefined ? "user.admin_status_changed" : "user.admin_role_changed",
    actorId: actor.userId,
    targetType: "user",
    targetId,
    meta: {
      ...(patch.roleKey !== undefined ? { role: patch.roleKey } : {}),
      ...(patch.disabled !== undefined ? { disabled: patch.disabled } : {}),
    },
    ip,
  });
}
