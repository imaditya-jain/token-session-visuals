import { NextResponse } from "next/server";

import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "@/server/auth/cookies";
import { AppError, unauthorized } from "@/server/http/errors";
import { assertSameOrigin, clientIp, route, userAgent } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { refreshSession } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const ip = clientIp(request);
  await enforceRateLimit(`refresh:ip:${ip}`, 60, 60);

  const token = readRefreshCookie(request);
  if (!token) throw unauthorized("No active session", "no_session");

  try {
    const result = await refreshSession(token, { ip, userAgent: userAgent(request) });
    const response = NextResponse.json({
      data: { accessToken: result.accessToken, expiresIn: result.expiresIn },
    });
    if (result.refreshToken) setRefreshCookie(response, result.refreshToken, result.refreshMaxAge);
    return response;
  } catch (error) {
    // A dead session must also drop the cookie so the browser stops presenting it.
    if (error instanceof AppError && error.status === 401) {
      const response = NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: 401 },
      );
      clearRefreshCookie(response);
      return response;
    }
    throw error;
  }
});
