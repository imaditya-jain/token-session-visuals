import "server-only";

import { NextResponse } from "next/server";

import { setRefreshCookie } from "@/server/auth/cookies";
import type { AuthResult } from "@/server/services/auth";

/** `{ data: { user, accessToken, expiresIn } }` plus the rotating refresh token as an httpOnly cookie. */
export function sessionResponse(result: AuthResult, status = 200): NextResponse {
  const response = NextResponse.json(
    { data: { user: result.user, accessToken: result.accessToken, expiresIn: result.expiresIn } },
    { status },
  );
  setRefreshCookie(response, result.refreshToken, result.refreshMaxAge);
  return response;
}
