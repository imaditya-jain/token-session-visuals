import "server-only";

import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authEnv } from "@/server/config/env";
import { logger } from "@/server/logger";

import { AppError, badRequest, forbidden } from "./errors";

const MAX_BODY_BYTES = 10_000;

type Context = { request: NextRequest; requestId: string };
type RouteFn = (context: Context) => Promise<NextResponse>;

const baseHeaders = (requestId: string): Record<string, string> => ({
  "Cache-Control": "no-store",
  "X-Request-Id": requestId,
});

/** Wraps a route: request id, uniform `{ error: { code, message } }` envelope, no stack traces to clients. */
export function route(fn: RouteFn): (request: NextRequest) => Promise<NextResponse> {
  return async (request) => {
    const requestId = request.headers.get("x-request-id")?.slice(0, 64) || randomUUID();
    try {
      const response = await fn({ request, requestId });
      for (const [key, value] of Object.entries(baseHeaders(requestId)))
        response.headers.set(key, value);
      return response;
    } catch (error) {
      if (error instanceof AppError) {
        return NextResponse.json(
          { error: { code: error.code, message: error.message } },
          { status: error.status, headers: { ...baseHeaders(requestId), ...error.headers } },
        );
      }
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            error: {
              code: "validation_error",
              message: "Some fields are invalid.",
              fields: error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            },
          },
          { status: 400, headers: baseHeaders(requestId) },
        );
      }
      logger.error(
        { err: error, requestId, path: request.nextUrl.pathname },
        "Unhandled route error",
      );
      return NextResponse.json(
        { error: { code: "internal_error", message: "Something went wrong." } },
        { status: 500, headers: baseHeaders(requestId) },
      );
    }
  };
}

/** Parses and validates a small JSON body. */
export async function readJson<S extends z.ZodType>(
  request: NextRequest,
  schema: S,
): Promise<z.infer<S>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw badRequest("Content-Type must be application/json", "unsupported_media_type");
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    throw new AppError(413, "payload_too_large", "Request body too large");
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES)
    throw new AppError(413, "payload_too_large", "Request body too large");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw badRequest("Body must be valid JSON", "invalid_json");
  }
  return schema.parse(json);
}

/**
 * CSRF defence for state-changing, cookie-authenticated endpoints: the browser's Origin (or Fetch Metadata)
 * must show the request came from this site. Combined with SameSite=Strict on the refresh cookie.
 */
export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (origin) {
    const allowed = new Set([request.nextUrl.origin]);
    const site = authEnvSafe();
    if (site) allowed.add(site);
    if (allowed.has(origin)) return;
    throw forbidden("Cross-origin request blocked", "csrf_blocked");
  }
  if (request.headers.get("sec-fetch-site") === "same-origin") return;
  throw forbidden("Cross-origin request blocked", "csrf_blocked");
}

function authEnvSafe(): string | undefined {
  try {
    const url = authEnv().SITE_URL;
    return url ? new URL(url).origin : undefined;
  } catch {
    return undefined;
  }
}

/** Client IP as set by the trusted edge (Vercel overwrites X-Forwarded-For). */
export function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || "unknown";
}

export const userAgent = (request: NextRequest): string =>
  (request.headers.get("user-agent") ?? "").slice(0, 200);
