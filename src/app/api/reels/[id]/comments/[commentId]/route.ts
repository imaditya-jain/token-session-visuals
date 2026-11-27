import { NextResponse } from "next/server";

import { assertSameOrigin, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { apiSegment } from "@/server/reels/path";
import { authenticate } from "@/server/services/auth";
import { deleteComment } from "@/server/services/reels";

export const dynamic = "force-dynamic";

export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`reels:write:${userId}`, 60, 3600);
  await deleteComment(userId, apiSegment(request, 1), apiSegment(request, 3));
  return new NextResponse(null, { status: 204 });
});
