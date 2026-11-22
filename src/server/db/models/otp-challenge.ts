import "server-only";

import { Schema, type Types } from "mongoose";

import { defineModel } from "@/server/db/define-model";

export type OtpPurpose = "admin_login" | "customer_login";

export type OtpChallengeRecord = {
  /** Opaque public handle the client sends back with the code. */
  ref: string;
  purpose: OtpPurpose;
  userId: Types.ObjectId;
  /** Keyed hash of the code bound to `ref`; the code itself exists only in the email. */
  codeHash: string;
  /** Wrong AND right guesses count: the cap bounds guessing across the challenge's whole lifetime, resends included. */
  attempts: number;
  sendCount: number;
  lastSentAt: Date;
  expiresAt: Date;
  consumedAt?: Date | undefined;
  createdAt: Date;
};

const otpChallengeSchema = new Schema<OtpChallengeRecord>({
  ref: { type: String, required: true, unique: true },
  purpose: { type: String, enum: ["admin_login", "customer_login"], required: true },
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, required: true, default: 0 },
  sendCount: { type: Number, required: true, default: 1 },
  lastSentAt: { type: Date, required: true },
  // TTL index: expired challenges are removed automatically.
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  consumedAt: { type: Date },
  createdAt: { type: Date, required: true, default: () => new Date() },
});

export const OtpChallenge = defineModel<OtpChallengeRecord>("OtpChallenge", otpChallengeSchema);
