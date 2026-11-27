import "server-only";

import { Types } from "mongoose";

import type { LoginInput, ProfileInput, RegisterInput } from "@/lib/auth-schemas";
import {
  generateRefreshToken,
  hashRefreshToken,
  newSessionId,
  signAccessToken,
  verifyAccessToken,
} from "@/server/auth/tokens";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "@/server/auth/password";
import { authEnv } from "@/server/config/env";
import { connectDb } from "@/server/db/connection";
import { type Role, User, type UserRecord } from "@/server/db/models/user";
import { siteUrl } from "@/server/config/env";
import { enqueueEmail } from "@/server/email/outbox";
import { AppError, badRequest, conflict, unauthorized } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { enqueueCustomerSync } from "@/server/queue/producers";
import { consumeAuthToken, issueAuthToken } from "@/server/services/auth-tokens";
import { syncMarketingConsent } from "@/server/services/newsletter";

const MAX_SESSIONS_PER_USER = 10;
/** A refresh chain can't be extended past this lifetime, however active the device is. */
const ABSOLUTE_SESSION_SECONDS = 30 * 24 * 3600;
/** A just-rotated token may be replayed this long (parallel tabs racing a refresh) without revoking. */
const ROTATION_GRACE_MS = 10_000;
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

export type SessionMeta = { ip: string; userAgent: string };

export type PublicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
  acceptsMarketing: boolean;
  emailVerified: boolean;
};

export type AuthResult = {
  user: PublicUser;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshMaxAge: number;
};

export type RefreshResult = {
  accessToken: string;
  expiresIn: number;
  /** Absent when the caller replayed a just-rotated token inside the grace window. */
  refreshToken?: string;
  refreshMaxAge: number;
};

const toPublicUser = (
  user: Pick<
    UserRecord,
    | "_id"
    | "email"
    | "firstName"
    | "lastName"
    | "phone"
    | "role"
    | "acceptsMarketing"
    | "emailVerifiedAt"
  >,
): PublicUser => ({
  id: String(user._id),
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  ...(user.phone ? { phone: user.phone } : {}),
  role: user.role,
  acceptsMarketing: user.acceptsMarketing,
  emailVerified: Boolean(user.emailVerifiedAt),
});

export async function startSession(user: UserRecord, meta: SessionMeta): Promise<AuthResult> {
  const { REFRESH_TOKEN_EXPIRY, ACCESS_TOKEN_EXPIRY } = authEnv();
  const now = new Date();
  const refreshToken = generateRefreshToken();
  const sid = newSessionId();

  // Drop expired sessions, then add this one, keeping only the newest MAX_SESSIONS_PER_USER.
  await User.updateOne({ _id: user._id }, { $pull: { sessions: { expiresAt: { $lte: now } } } });
  await User.updateOne(
    { _id: user._id },
    {
      $push: {
        sessions: {
          $each: [
            {
              sid,
              tokenHash: hashRefreshToken(refreshToken),
              userAgent: meta.userAgent,
              ip: meta.ip,
              createdAt: now,
              expiresAt: new Date(now.getTime() + REFRESH_TOKEN_EXPIRY * 1000),
            },
          ],
          $slice: -MAX_SESSIONS_PER_USER,
        },
      },
    },
  );

  return {
    user: toPublicUser(user),
    accessToken: await signAccessToken({ sub: String(user._id), sid, role: user.role }),
    expiresIn: ACCESS_TOKEN_EXPIRY,
    refreshToken,
    refreshMaxAge: REFRESH_TOKEN_EXPIRY,
  };
}

export async function registerUser(input: RegisterInput, meta: SessionMeta): Promise<AuthResult> {
  await connectDb();
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await User.create({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      acceptsMarketing: input.acceptsMarketing,
    });
    const record = user.toObject();
    await sendVerificationEmail(record).catch((error: unknown) =>
      // Registration must not fail because email is down; the user can request a new link.
      logger.error(
        { err: error, userId: String(record._id) },
        "Could not enqueue verification email",
      ),
    );
    await enqueueCustomerSync(String(record._id));
    return await startSession(record, meta);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw conflict("An account with this email already exists.", "email_taken");
    }
    throw error;
  }
}

/**
 * Checks email + password with lockout. Every failure (unknown email, wrong password, disabled account)
 * answers the same generic error so the endpoint can't be used to discover accounts.
 */
export async function verifyCredentials(input: LoginInput): Promise<UserRecord> {
  await connectDb();
  const user = await User.findOne({ email: input.email }).select("+passwordHash").lean();
  const invalid = () => unauthorized("Incorrect email or password.", "invalid_credentials");

  if (!user) {
    await verifyAgainstDummy(input.password);
    throw invalid();
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    throw new AppError(429, "account_locked", "Too many failed attempts. Try again later.", {
      "Retry-After": String(Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000)),
    });
  }

  if (!(await verifyPassword(user.passwordHash, input.password))) {
    const failures = (user.failedLoginCount ?? 0) + 1;
    await User.updateOne(
      { _id: user._id },
      failures >= MAX_FAILED_LOGINS
        ? { $set: { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCK_MS) } }
        : { $set: { failedLoginCount: failures } },
    );
    throw invalid();
  }
  if (user.disabledAt) throw invalid();

  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await User.updateOne(
      { _id: user._id },
      { $set: { failedLoginCount: 0 }, $unset: { lockedUntil: 1 } },
    );
  }
  return user;
}

type SessionLookup = { user: UserRecord; session: UserRecord["sessions"][number] } | null;

async function findSession(
  field: "tokenHash" | "prevTokenHash",
  hash: string,
): Promise<SessionLookup> {
  const user = await User.findOne({ [`sessions.${field}`]: hash })
    .select("+sessions")
    .lean();
  const session = user?.sessions.find((candidate) => candidate[field] === hash);
  return user && session ? { user, session } : null;
}

const revokeSession = (userId: Types.ObjectId, sid: string) =>
  User.updateOne({ _id: userId }, { $pull: { sessions: { sid } } });

/**
 * Exchanges a refresh token for a new access token and ROTATES the refresh token.
 * Replaying an already-rotated token (outside the short grace window) is treated as theft: the session is revoked.
 */
export async function refreshSession(rawToken: string, meta: SessionMeta): Promise<RefreshResult> {
  await connectDb();
  const { REFRESH_TOKEN_EXPIRY, ACCESS_TOKEN_EXPIRY } = authEnv();
  const hash = hashRefreshToken(rawToken);
  const now = new Date();

  const current = await findSession("tokenHash", hash);
  if (current) {
    const { user, session } = current;
    const absoluteEnd = new Date(session.createdAt.getTime() + ABSOLUTE_SESSION_SECONDS * 1000);
    if (session.expiresAt <= now || absoluteEnd <= now) {
      await revokeSession(user._id, session.sid);
      throw unauthorized("Session expired. Please sign in again.", "session_expired");
    }

    const nextToken = generateRefreshToken();
    const nextExpiry = new Date(
      Math.min(now.getTime() + REFRESH_TOKEN_EXPIRY * 1000, absoluteEnd.getTime()),
    );
    const rotated = await User.updateOne(
      { _id: user._id, sessions: { $elemMatch: { sid: session.sid, tokenHash: hash } } },
      {
        $set: {
          "sessions.$.tokenHash": hashRefreshToken(nextToken),
          "sessions.$.prevTokenHash": hash,
          "sessions.$.rotatedAt": now,
          "sessions.$.expiresAt": nextExpiry,
          "sessions.$.ip": meta.ip,
          "sessions.$.userAgent": meta.userAgent,
        },
      },
    );
    // Another request rotated first; fall through and treat this one as a (graceful) replay.
    if (rotated.modifiedCount === 1) {
      return {
        accessToken: await signAccessToken({
          sub: String(user._id),
          sid: session.sid,
          role: user.role,
        }),
        expiresIn: ACCESS_TOKEN_EXPIRY,
        refreshToken: nextToken,
        refreshMaxAge: Math.max(1, Math.floor((nextExpiry.getTime() - now.getTime()) / 1000)),
      };
    }
  }

  const replayed = await findSession("prevTokenHash", hash);
  if (replayed) {
    const { user, session } = replayed;
    if (session.rotatedAt && now.getTime() - session.rotatedAt.getTime() <= ROTATION_GRACE_MS) {
      return {
        accessToken: await signAccessToken({
          sub: String(user._id),
          sid: session.sid,
          role: user.role,
        }),
        expiresIn: ACCESS_TOKEN_EXPIRY,
        refreshMaxAge: Math.max(
          1,
          Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000),
        ),
      };
    }
    await revokeSession(user._id, session.sid);
    throw unauthorized("Session revoked. Please sign in again.", "token_reuse");
  }

  throw unauthorized("Invalid refresh token.", "invalid_refresh_token");
}

/** Revokes the session that owns this refresh token; unknown tokens are ignored (idempotent logout). */
export async function logoutSession(rawToken: string): Promise<void> {
  await connectDb();
  const hash = hashRefreshToken(rawToken);
  await User.updateOne(
    { $or: [{ "sessions.tokenHash": hash }, { "sessions.prevTokenHash": hash }] },
    { $pull: { sessions: { $or: [{ tokenHash: hash }, { prevTokenHash: hash }] } } },
  );
}

export async function logoutAllSessions(userId: string): Promise<void> {
  await connectDb();
  await User.updateOne({ _id: userId }, { $set: { sessions: [] } });
}

export type AuthContext = { userId: string; sid: string; role: Role; adminRole?: string };

/**
 * For endpoints anyone may read: no Authorization header means an anonymous visitor (null); a header that is
 * present must still be valid, so a stale token is told to refresh instead of silently losing "liked" state.
 */
export async function authenticateOptional(authorization: string | null): Promise<string | null> {
  if (!authorization) return null;
  return (await authenticate(authorization)).userId;
}

/** Verifies the Bearer access token AND that its session still exists (revocation is immediate). */
export async function authenticate(authorization: string | null): Promise<AuthContext> {
  if (!authorization?.startsWith("Bearer ")) throw unauthorized();
  const token = authorization.slice("Bearer ".length).trim();

  let claims;
  try {
    claims = await verifyAccessToken(token);
  } catch (error) {
    const expired = (error as { code?: string }).code === "ERR_JWT_EXPIRED";
    throw unauthorized(
      expired ? "Access token expired" : "Invalid access token",
      expired ? "token_expired" : "invalid_token",
    );
  }
  if (!Types.ObjectId.isValid(claims.sub))
    throw unauthorized("Invalid access token", "invalid_token");

  await connectDb();
  const user = await User.findOne({
    _id: claims.sub,
    sessions: { $elemMatch: { sid: claims.sid, expiresAt: { $gt: new Date() } } },
  })
    .select("role adminRole")
    .lean();
  if (!user) throw unauthorized("Session is no longer valid", "session_revoked");

  // Roles come from the database, never from the token, so demotions apply immediately.
  return {
    userId: claims.sub,
    sid: claims.sid,
    role: user.role,
    ...(user.adminRole ? { adminRole: user.adminRole } : {}),
  };
}

export async function getProfile(userId: string): Promise<PublicUser> {
  await connectDb();
  const user = await User.findById(userId).lean();
  if (!user) throw unauthorized("Account not found", "session_revoked");
  return toPublicUser(user);
}

export async function updateProfile(userId: string, patch: ProfileInput): Promise<PublicUser> {
  await connectDb();
  const { phone, ...rest } = patch;
  const update =
    phone === undefined
      ? { $set: rest }
      : phone === ""
        ? { $set: rest, $unset: { phone: 1 } }
        : { $set: { ...rest, phone } };
  const user = await User.findByIdAndUpdate(userId, update, {
    returnDocument: "after",
    runValidators: true,
  }).lean();
  if (!user) throw unauthorized("Account not found", "session_revoked");
  // Keep the mailing list in step with the preference (only verified accounts can opt in from settings).
  if (rest.acceptsMarketing !== undefined && (user.emailVerifiedAt || !rest.acceptsMarketing)) {
    await syncMarketingConsent(user.email, rest.acceptsMarketing);
  }
  await enqueueCustomerSync(String(user._id));
  return toPublicUser(user);
}

type MailTarget = Pick<UserRecord, "_id" | "email" | "firstName">;

async function sendVerificationEmail(user: MailTarget): Promise<void> {
  const token = await issueAuthToken(user._id, "verify_email");
  const url = `${siteUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  await enqueueEmail("verify-email", user.email, { firstName: user.firstName, url });
}

/** Re-sends the verification link to a signed-in, unverified user. */
export async function requestEmailVerification(userId: string): Promise<void> {
  await connectDb();
  const user = await User.findById(userId).lean();
  if (!user) throw unauthorized("Account not found", "session_revoked");
  if (user.emailVerifiedAt) return;
  await sendVerificationEmail(user);
}

export async function confirmEmailVerification(rawToken: string): Promise<void> {
  const userId = await consumeAuthToken(rawToken, "verify_email");
  if (!userId)
    throw badRequest("This confirmation link is invalid or has expired.", "invalid_token");
  const verified = await User.findOneAndUpdate(
    { _id: userId, emailVerifiedAt: { $exists: false } },
    { $set: { emailVerifiedAt: new Date() } },
  ).lean();
  // The marketing box ticked at sign-up counts as consent once the mailbox is proven.
  if (verified?.acceptsMarketing) await syncMarketingConsent(verified.email, true);
  // A proven mailbox may now adopt an existing Shopify customer and claim its earlier orders.
  if (verified) await enqueueCustomerSync(String(userId));
}

/** Always resolves, whether or not the email has an account, so the endpoint can't be used to enumerate users. */
export async function requestPasswordReset(email: string): Promise<void> {
  await connectDb();
  const user = await User.findOne({ email }).lean();
  if (!user) return;
  const token = await issueAuthToken(user._id, "reset_password");
  // Administrators reset on the admin's own pages and are sent back to the admin sign-in.
  const path = user.adminRole ? "/admin/reset-password" : "/reset-password";
  const url = `${siteUrl()}${path}?token=${encodeURIComponent(token)}`;
  await enqueueEmail("reset-password", user.email, { firstName: user.firstName, url });
}

/**
 * Sets a new password from an emailed token. Signs the account out everywhere (a stolen session must not
 * survive a reset), clears any lockout, and treats the click as proof of mailbox ownership.
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const userId = await consumeAuthToken(rawToken, "reset_password");
  if (!userId) throw badRequest("This reset link is invalid or has expired.", "invalid_token");

  const passwordHash = await hashPassword(newPassword);
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { passwordHash, sessions: [], failedLoginCount: 0 }, $unset: { lockedUntil: 1 } },
    { returnDocument: "after" },
  ).lean();
  if (!user) throw badRequest("This reset link is invalid or has expired.", "invalid_token");

  const verifiedNow = await User.updateOne(
    { _id: userId, emailVerifiedAt: { $exists: false } },
    { $set: { emailVerifiedAt: new Date() } },
  );
  if (verifiedNow.modifiedCount > 0) await enqueueCustomerSync(String(userId));
  await enqueueEmail("password-changed", user.email, { firstName: user.firstName }).catch(
    (error: unknown) =>
      logger.error(
        { err: error, userId: String(userId) },
        "Could not enqueue password-changed email",
      ),
  );
}
