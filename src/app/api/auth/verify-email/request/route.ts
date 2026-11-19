import { NextResponse } from "next/server";

import { route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate, requestEmailVerification } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`verify-request:user:${userId}`, 3, 3600);
  await requestEmailVerification(userId);
  return new NextResponse(null, { status: 202 });
});
