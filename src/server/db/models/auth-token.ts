import "server-only";

import { Schema, type Types } from "mongoose";

import { defineModel } from "@/server/db/define-model";

export type AuthTokenType = "verify_email" | "reset_password" | "newsletter_confirm";

export type AuthTokenRecord = {
  /** Owner of the token: a user id, or a subscriber id for newsletter confirmations. */
  userId: Types.ObjectId;
  type: AuthTokenType;
  /** Keyed hash of the emailed token; the raw token exists only in the email. */
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | undefined;
  createdAt: Date;
};

const authTokenSchema = new Schema<AuthTokenRecord>({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  type: {
    type: String,
    enum: ["verify_email", "reset_password", "newsletter_confirm"],
    required: true,
  },
  tokenHash: { type: String, required: true, unique: true },
  // TTL index: expired tokens are deleted automatically.
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  usedAt: { type: Date },
  createdAt: { type: Date, required: true, default: () => new Date() },
});

export const AuthToken = defineModel<AuthTokenRecord>("AuthToken", authTokenSchema);
