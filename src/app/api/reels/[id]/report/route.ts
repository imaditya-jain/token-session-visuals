import { NextResponse } from "next/server";

import { reportSchema } from "@/lib/reels";
import { assertSameOrigin, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { apiSegment } from "@/server/reels/path";
import { authenticate } from "@/server/services/auth";
import { reportReel } from "@/server/services/reels";

export const dynamic = "force-dynamic";

/** Reporting the same reel twice is not an error; the second report just changes nothing. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`reels:report:${userId}`, 30, 3600);
  const { reason, commentId } = await readJson(request, reportSchema);
  await reportReel(userId, apiSegment(request, 1), reason, commentId);
  return new NextResponse(null, { status: 204 });
});
