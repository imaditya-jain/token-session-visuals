import "server-only";

import { createHmac, randomBytes, randomUUID } from "node:crypto";

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
