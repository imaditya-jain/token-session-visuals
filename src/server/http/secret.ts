import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { forbidden } from "./errors";

const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Guards operational endpoints (cron, readiness) with `Authorization: Bearer <secret>`. Returns false when the
 * secret is not configured so callers can answer 503 instead of silently allowing access (fails closed).
 */
export function assertBearerSecret(request: NextRequest, secret: string | undefined): boolean {
  if (!secret) return false;
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`))
    throw forbidden("Forbidden");
  return true;
}
