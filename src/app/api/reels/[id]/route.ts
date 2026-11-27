import { NextResponse } from "next/server";

import { updateReelSchema } from "@/lib/reels";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { apiSegment } from "@/server/reels/path";
import { authenticate, authenticateOptional } from "@/server/services/auth";
import { deleteOwnReel, getReel, updateOwnReel } from "@/server/services/reels";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  const userId = await authenticateOptional(request.headers.get("authorization"));
  await enforceRateLimit(`reels:read:${userId ?? clientIp(request)}`, 240, 60);
  return NextResponse.json({ data: { reel: await getReel(userId, apiSegment(request, 1)) } });
});

export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`reels:write:${userId}`, 60, 3600);
  await deleteOwnReel(userId, apiSegment(request, 1));
  return new NextResponse(null, { status: 204 });
});

/** Edit your own caption, topic or linked products. */
export const PATCH = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`reels:write:${userId}`, 60, 3600);
  const patch = await readJson(request, updateReelSchema);
  return NextResponse.json({
    data: { reel: await updateOwnReel(userId, apiSegment(request, 1), patch) },
  });
});
