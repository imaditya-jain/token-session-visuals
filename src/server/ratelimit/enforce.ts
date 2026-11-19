import "server-only";

import { tooManyRequests } from "@/server/http/errors";

import { rateLimiter } from "./index";

/** Throws a 429 (with Retry-After) once `limit` hits per `windowSeconds` are exceeded for this key. */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const result = await rateLimiter.consume(key, limit, windowSeconds);
  if (!result.allowed) throw tooManyRequests(result.retryAfterSeconds);
}
