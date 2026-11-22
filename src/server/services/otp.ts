import "server-only";

import { generateOtpCode, generateOtpRef, hashOtp, otpMatches } from "@/server/auth/otp";
import { connectDb } from "@/server/db/connection";
import { OtpChallenge, type OtpPurpose } from "@/server/db/models/otp-challenge";
import { User, type UserRecord } from "@/server/db/models/user";
import { enqueueEmail } from "@/server/email/outbox";
import { AppError, badRequest } from "@/server/http/errors";
import type { Types } from "mongoose";

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS = 3;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export type OtpIssued = { ref: string; expiresIn: number; resendAfter: number };

type Recipient = Pick<UserRecord, "_id" | "email" | "firstName">;

const AUDIENCE: Record<OtpPurpose, "admin" | "customer"> = {
  admin_login: "admin",
  customer_login: "customer",
};

const sendCode = (user: Recipient, purpose: OtpPurpose, code: string) =>
  enqueueEmail("otp-code", user.email, {
    firstName: user.firstName,
    code,
    minutes: OTP_TTL_SECONDS / 60,
    audience: AUDIENCE[purpose],
  });

/** Starts a challenge and emails the code. Any earlier open challenge of the same kind for this user is voided. */
export async function issueOtp(user: Recipient, purpose: OtpPurpose): Promise<OtpIssued> {
  await connectDb();
  const now = new Date();
  await OtpChallenge.updateMany(
    { userId: user._id, purpose, consumedAt: { $exists: false } },
    { $set: { consumedAt: now } },
  );

  const ref = generateOtpRef();
  const code = generateOtpCode();
  await OtpChallenge.create({
    ref,
    purpose,
    userId: user._id,
    codeHash: hashOtp(ref, code),
    lastSentAt: now,
    expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
  });
  await sendCode(user, purpose, code);
  return { ref, expiresIn: OTP_TTL_SECONDS, resendAfter: OTP_RESEND_COOLDOWN_SECONDS };
}

/**
 * Sends a fresh code for an open challenge. Bounded by a cooldown and a per-challenge send cap, and it does
 * NOT reset the attempt counter, so resending can't be used to extend guessing.
 */
export async function resendOtp(ref: string, purpose: OtpPurpose): Promise<OtpIssued> {
  await connectDb();
  const now = new Date();
  const code = generateOtpCode();
  const cooldownEnd = new Date(now.getTime() - OTP_RESEND_COOLDOWN_SECONDS * 1000);

  const challenge = await OtpChallenge.findOneAndUpdate(
    {
      ref,
      purpose,
      consumedAt: { $exists: false },
      expiresAt: { $gt: now },
      sendCount: { $lt: OTP_MAX_SENDS },
      lastSentAt: { $lte: cooldownEnd },
    },
    {
      $set: {
        codeHash: hashOtp(ref, code),
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
      },
      $inc: { sendCount: 1 },
    },
  ).lean();

  if (!challenge) {
    const existing = await OtpChallenge.findOne({ ref, purpose }).lean();
    if (existing && !existing.consumedAt && existing.expiresAt > now) {
      if (existing.sendCount >= OTP_MAX_SENDS) {
        throw new AppError(429, "otp_resend_limit", "Too many codes requested. Start again.");
      }
      const wait = Math.ceil(
        (existing.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000 - now.getTime()) / 1000,
      );
      throw new AppError(429, "otp_resend_wait", "Please wait before requesting another code.", {
        "Retry-After": String(Math.max(1, wait)),
      });
    }
    throw badRequest("This code request has expired. Start again.", "otp_expired");
  }

  const user = await User.findById(challenge.userId).lean();
  if (!user || user.disabledAt) throw badRequest("This code request has expired.", "otp_expired");
  await sendCode(user, purpose, code);
  return { ref, expiresIn: OTP_TTL_SECONDS, resendAfter: OTP_RESEND_COOLDOWN_SECONDS };
}

const invalidCode = () => badRequest("That code is incorrect or has expired.", "invalid_code");

/**
 * Checks a code and consumes the challenge. The attempt counter is incremented atomically BEFORE the
 * comparison, so parallel guesses cannot exceed the cap; success is single-use.
 */
export async function verifyOtp(
  ref: string,
  code: string,
  purpose: OtpPurpose,
): Promise<Types.ObjectId> {
  await connectDb();
  const now = new Date();
  const challenge = await OtpChallenge.findOneAndUpdate(
    {
      ref,
      purpose,
      consumedAt: { $exists: false },
      expiresAt: { $gt: now },
      attempts: { $lt: OTP_MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" },
  ).lean();
  if (!challenge || !otpMatches(ref, code, challenge.codeHash)) throw invalidCode();

  const consumed = await OtpChallenge.findOneAndUpdate(
    { _id: challenge._id, consumedAt: { $exists: false } },
    { $set: { consumedAt: now } },
  ).lean();
  if (!consumed) throw invalidCode();
  return challenge.userId;
}
