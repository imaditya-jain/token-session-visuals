import "server-only";

import type { Types } from "mongoose";

import { generateEmailToken, hashEmailToken } from "@/server/auth/tokens";
import { connectDb } from "@/server/db/connection";
import { AuthToken, type AuthTokenType } from "@/server/db/models/auth-token";

const TTL_SECONDS: Record<AuthTokenType, number> = {
  verify_email: 24 * 3600,
  reset_password: 3600,
};

/** Creates a single-use token and invalidates any earlier unused token of the same kind for this user. */
export async function issueAuthToken(
  userId: Types.ObjectId | string,
  type: AuthTokenType,
): Promise<string> {
  await connectDb();
  const now = new Date();
  await AuthToken.updateMany(
    { userId, type, usedAt: { $exists: false } },
    { $set: { usedAt: now } },
  );

  const raw = generateEmailToken();
  await AuthToken.create({
    userId,
    type,
    tokenHash: hashEmailToken(raw),
    expiresAt: new Date(now.getTime() + TTL_SECONDS[type] * 1000),
  });
  return raw;
}

/**
 * Atomically consumes a token: one request can win, replays and expired or mismatched-type tokens return null.
 */
export async function consumeAuthToken(
  raw: string,
  type: AuthTokenType,
): Promise<Types.ObjectId | null> {
  await connectDb();
  const now = new Date();
  const token = await AuthToken.findOneAndUpdate(
    { tokenHash: hashEmailToken(raw), type, usedAt: { $exists: false }, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
  ).lean();
  return token ? token.userId : null;
}
