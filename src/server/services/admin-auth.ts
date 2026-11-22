import "server-only";

import type { Types } from "mongoose";

import type { LoginInput } from "@/lib/auth-schemas";
import { generateOtpRef } from "@/server/auth/otp";
import { connectDb } from "@/server/db/connection";
import { User } from "@/server/db/models/user";
import { AppError, badRequest, unauthorized } from "@/server/http/errors";
import { enqueueCustomerSync } from "@/server/queue/producers";
import { recordAudit } from "@/server/services/audit";
import {
  type AuthResult,
  type SessionMeta,
  startSession,
  verifyCredentials,
} from "@/server/services/auth";
import {
  issueOtp,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  type OtpIssued,
  verifyOtp,
} from "@/server/services/otp";

async function markVerified(userId: Types.ObjectId): Promise<Date> {
  const now = new Date();
  await User.updateOne(
    { _id: userId, emailVerifiedAt: { $exists: false } },
    { $set: { emailVerifiedAt: now } },
  );
  return now;
}

/**
 * Admin sign-in is two steps: password, then a one-time code emailed to the account. The first step never
 * opens a session and never reveals whether an email belongs to an administrator.
 */
export async function startAdminLogin(input: LoginInput, meta: SessionMeta): Promise<OtpIssued> {
  let user;
  try {
    user = await verifyCredentials(input);
  } catch (error) {
    if (error instanceof AppError) {
      await recordAudit({ action: "auth.admin_login_failed", ip: meta.ip });
    }
    throw error;
  }
  if (!user.adminRole) {
    await recordAudit({ action: "auth.admin_login_failed", ip: meta.ip, actorId: user._id });
    throw unauthorized("Incorrect email or password.", "invalid_credentials");
  }
  return issueOtp(user, "admin_login");
}

export async function completeAdminLogin(
  ref: string,
  code: string,
  meta: SessionMeta,
): Promise<AuthResult> {
  let userId;
  try {
    userId = await verifyOtp(ref, code, "admin_login");
  } catch (error) {
    await recordAudit({ action: "auth.admin_otp_failed", ip: meta.ip });
    throw error;
  }
  await connectDb();
  const user = await User.findById(userId).lean();
  // Re-check at the moment of sign-in: the role may have been revoked since the code was sent.
  if (!user?.adminRole || user.disabledAt) {
    throw badRequest("That code is incorrect or has expired.", "invalid_code");
  }
  // Receiving the code proves control of the mailbox.
  const verified = user.emailVerifiedAt ?? (await markVerified(user._id));
  await recordAudit({ action: "auth.admin_login", actorId: user._id, ip: meta.ip });
  return startSession({ ...user, emailVerifiedAt: verified }, meta);
}

/**
 * Passwordless customer sign-in by emailed code. Answers identically for unknown, admin and disabled
 * addresses (a decoy handle is returned) so it can't be used to discover accounts.
 */
export async function startCustomerOtp(email: string): Promise<OtpIssued> {
  await connectDb();
  const user = await User.findOne({ email }).lean();
  if (user && !user.adminRole && !user.disabledAt) return issueOtp(user, "customer_login");
  return {
    ref: generateOtpRef(),
    expiresIn: OTP_TTL_SECONDS,
    resendAfter: OTP_RESEND_COOLDOWN_SECONDS,
  };
}

export async function completeCustomerOtp(
  ref: string,
  code: string,
  meta: SessionMeta,
): Promise<AuthResult> {
  const userId = await verifyOtp(ref, code, "customer_login");
  await connectDb();
  const user = await User.findById(userId).lean();
  if (!user || user.adminRole || user.disabledAt) {
    throw badRequest("That code is incorrect or has expired.", "invalid_code");
  }
  let verified = user.emailVerifiedAt;
  if (!verified) {
    verified = await markVerified(user._id);
    // A proven mailbox may adopt an existing Shopify customer (same rule as the verification link).
    await enqueueCustomerSync(String(user._id));
  }
  return startSession({ ...user, emailVerifiedAt: verified }, meta);
}
