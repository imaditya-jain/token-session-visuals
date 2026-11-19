import "server-only";

import { Schema, type Types } from "mongoose";

import { defineModel } from "@/server/db/define-model";

export type Role = "customer" | "staff" | "admin";

export type UserSession = {
  /** Stable id of this device session; carried in the access token (`sid`). */
  sid: string;
  /** HMAC-SHA256 of the current refresh token (the raw token is never stored). */
  tokenHash: string;
  /** Hash of the immediately previous token, kept to detect replay of a rotated token. */
  prevTokenHash?: string | undefined;
  rotatedAt?: Date | undefined;
  userAgent?: string | undefined;
  ip?: string | undefined;
  createdAt: Date;
  expiresAt: Date;
};

export type UserRecord = {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string | undefined;
  role: Role;
  acceptsMarketing: boolean;
  /** Set once the owner proves control of the mailbox (verification link or password-reset link). */
  emailVerifiedAt?: Date | undefined;
  shopifyCustomerId?: string | undefined;
  failedLoginCount: number;
  lockedUntil?: Date | undefined;
  sessions: UserSession[];
  createdAt: Date;
  updatedAt: Date;
};

const sessionSchema = new Schema<UserSession>(
  {
    sid: { type: String, required: true },
    tokenHash: { type: String, required: true },
    prevTokenHash: { type: String },
    rotatedAt: { type: Date },
    userAgent: { type: String, maxlength: 200 },
    ip: { type: String, maxlength: 64 },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema<UserRecord>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 32 },
    role: {
      type: String,
      enum: ["customer", "staff", "admin"],
      default: "customer",
      required: true,
    },
    acceptsMarketing: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date },
    shopifyCustomerId: { type: String },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    sessions: { type: [sessionSchema], default: [], select: false },
  },
  { timestamps: true },
);

userSchema.index({ "sessions.sid": 1 });
userSchema.index({ "sessions.tokenHash": 1 });
userSchema.index({ "sessions.prevTokenHash": 1 });

export const User = defineModel<UserRecord>("User", userSchema);
