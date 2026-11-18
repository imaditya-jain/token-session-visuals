import "server-only";

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { authEnv } from "@/server/config/env";
import type { Role } from "@/server/db/models/user";

const ISSUER = "fernwood";
const AUDIENCE = "fernwood-storefront";
const secretKey = () => new TextEncoder().encode(authEnv().ACCESS_TOKEN_SECRET);

export type AccessClaims = { sub: string; sid: string; role: Role };

const claimsSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  role: z.enum(["customer", "staff", "admin"]),
});

/** Short-lived access token (default 15 minutes), sent as `Authorization: Bearer` on every API call. */
export async function signAccessToken(claims: AccessClaims): Promise<string> {
  const { ACCESS_TOKEN_EXPIRY } = authEnv();
  return new SignJWT({ sid: claims.sid, role: claims.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_EXPIRY}s`)
    .sign(secretKey());
}

/** Verifies signature, algorithm, issuer, audience and expiry. Throws on any failure. */
export async function verifyAccessToken(
  token: string,
  options: { now?: Date } = {},
): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, secretKey(), {
    algorithms: ["HS256"],
    issuer: ISSUER,
    audience: AUDIENCE,
    ...(options.now ? { currentDate: options.now } : {}),
  });
  return claimsSchema.parse(payload);
}

/** Opaque 256-bit refresh token (base64url). Only its keyed hash is stored. */
export const generateRefreshToken = (): string => randomBytes(32).toString("base64url");

/**
 * Keyed hash (HMAC-SHA256 with REFRESH_TOKEN_SECRET as pepper): a leaked database alone cannot be used to
 * forge or verify refresh tokens.
 */
export const hashRefreshToken = (token: string): string =>
  createHmac("sha256", authEnv().REFRESH_TOKEN_SECRET).update(token).digest("hex");

export const newSessionId = (): string => randomUUID();

/**
 * Keyed hash for emailed one-time tokens (verification, password reset). Domain-separated from refresh
 * tokens so one kind of token can never be presented as the other.
 */
export const hashEmailToken = (token: string): string =>
  createHmac("sha256", authEnv().REFRESH_TOKEN_SECRET).update(`email-token:${token}`).digest("hex");

export const generateEmailToken = (): string => randomBytes(32).toString("base64url");

/**
 * Stateless unsubscribe token: `base64url(email).hmac`. It never expires (people must always be able to opt
 * out) and can't be forged or used to unsubscribe anyone else, because the HMAC binds it to one address.
 */
const unsubscribeMac = (email: string): string =>
  createHmac("sha256", authEnv().REFRESH_TOKEN_SECRET)
    .update(`unsubscribe:${email}`)
    .digest("base64url");

export const createUnsubscribeToken = (email: string): string => {
  const normalized = email.toLowerCase();
  return `${Buffer.from(normalized).toString("base64url")}.${unsubscribeMac(normalized)}`;
};

/** Returns the email when the token is authentic, otherwise null. */
export function readUnsubscribeToken(token: string): string | null {
  const [encoded, mac, ...rest] = token.split(".");
  if (!encoded || !mac || rest.length > 0 || token.length > 400) return null;
  const email = Buffer.from(encoded, "base64url").toString("utf8");
  const expected = Buffer.from(unsubscribeMac(email));
  const received = Buffer.from(mac);
  return expected.length === received.length && timingSafeEqual(expected, received) ? email : null;
}
