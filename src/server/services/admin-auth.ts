import "server-only";

import type { Types } from "mongoose";

import type { LoginInput } from "@/lib/auth-schemas";
import { connectDb } from "@/server/db/connection";
import { User, type UserRecord } from "@/server/db/models/user";
import { AppError, badRequest, forbidden, unauthorized } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { adminConfigured, enqueueCustomerSync } from "@/server/queue/producers";
import { syncCustomer } from "@/server/services/customer-sync";
import { recordAudit } from "@/server/services/audit";
import {
  type AuthResult,
  type SessionMeta,
  startSession,
  verifyCredentials,
} from "@/server/services/auth";
import { issueOtp, type OtpIssued, verifyOtp } from "@/server/services/otp";

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
 * Customer sign-in, step 1. In order: the account exists, it is not an administrator, the password is right
 * (lockout applies), and it is linked to its Shopify customer (GID). Only then is a one-time code emailed;
 * no session exists until the code is verified. Every credential failure answers the same generic error.
 */
export async function startCustomerLogin(input: LoginInput): Promise<OtpIssued> {
  const user = await verifyCredentials(input);
  // Administrators have their own portal with its own code step; the storefront never signs them in.
  if (user.adminRole) {
    throw forbidden("Administrators sign in at /admin/login.", "admin_login_required");
  }
  await assertShopifyLinked(user);
  return issueOtp(user, "customer_login");
}

/**
 * The account must be mirrored to Shopify before it can sign in. A missing link is repaired on the spot
 * (the sync is idempotent); if Shopify can't be reached the sign-in waits rather than proceeding unlinked.
 * Skipped only where Shopify Admin isn't configured (local and test environments), and for a mailbox not yet
 * proven: the code step proves it and then re-runs the sync, which is allowed to adopt an existing customer.
 */
async function assertShopifyLinked(user: UserRecord): Promise<void> {
  if (user.shopifyCustomerId || !adminConfigured()) return;
  try {
    await syncCustomer(String(user._id));
  } catch (error) {
    logger.error(
      { err: error, userId: String(user._id) },
      "Customer link repair failed at sign-in",
    );
    throw pending();
  }
  const linked = await User.exists({ _id: user._id, shopifyCustomerId: { $exists: true } });
  if (!linked && user.emailVerifiedAt) throw pending();
}

const pending = () =>
  new AppError(
    503,
    "account_setup_pending",
    "We're finishing setting up your account. Please try again in a minute.",
    { "Retry-After": "30" },
  );

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
