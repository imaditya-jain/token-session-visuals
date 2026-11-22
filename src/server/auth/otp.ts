import "server-only";

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { authEnv } from "@/server/config/env";

/** Six digits drawn from the OS CSPRNG (uniform, no modulo bias). */
export const generateOtpCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0");

export const generateOtpRef = (): string => randomBytes(16).toString("base64url");

/**
 * Keyed hash bound to the challenge handle: a leaked database cannot be used to recover codes (the space is
 * only 10^6, so an unkeyed hash would be trivially reversible), and a hash can't be replayed on another challenge.
 */
export const hashOtp = (ref: string, code: string): string =>
  createHmac("sha256", authEnv().REFRESH_TOKEN_SECRET).update(`otp:${ref}:${code}`).digest("hex");

export function otpMatches(ref: string, code: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashOtp(ref, code));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
