import { NextResponse } from "next/server";

import { clearRefreshCookie, readRefreshCookie } from "@/server/auth/cookies";
import { assertSameOrigin, route } from "@/server/http/handler";
import { logoutSession } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const token = readRefreshCookie(request);
  if (token) await logoutSession(token);
  const response = new NextResponse(null, { status: 204 });
  clearRefreshCookie(response);
  return response;
});
