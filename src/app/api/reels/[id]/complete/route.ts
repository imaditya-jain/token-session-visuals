import { NextResponse } from "next/server";

import { assertSameOrigin, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { apiSegment } from "@/server/reels/path";
import { authenticate } from "@/server/services/auth";
import { completeReel } from "@/server/services/reels";

export const dynamic = "force-dynamic";

/** Called after the file was uploaded: the file is checked, then the reel waits for approval. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`reels:create:${userId}`, 40, 3600);
  return NextResponse.json({ data: { reel: await completeReel(userId, apiSegment(request, 1)) } });
});
