import { NextResponse } from "next/server";

import { clearRefreshCookie } from "@/server/auth/cookies";
import { route } from "@/server/http/handler";
import { authenticate, logoutAllSessions } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  await logoutAllSessions(userId);
  const response = new NextResponse(null, { status: 204 });
  clearRefreshCookie(response);
  return response;
});
