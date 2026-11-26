import "server-only";

import { NextResponse } from "next/server";

import type { AuthResult } from "@/server/services/auth";

/**
 * Session for the mobile app: the rotating refresh token travels in the body (the app keeps it in secure storage)
 * instead of an httpOnly cookie. Never cached, never logged.
 */
export function nativeSessionResponse(result: AuthResult, status = 200): NextResponse {
  return NextResponse.json(
    {
      data: {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        refreshToken: result.refreshToken,
      },
    },
    { status },
  );
}
