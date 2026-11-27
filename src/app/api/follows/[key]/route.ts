import { NextResponse } from "next/server";

import { assertSameOrigin, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { apiSegment } from "@/server/reels/path";
import { authenticate } from "@/server/services/auth";
import { follow, unfollow } from "@/server/services/reel-social";

export const dynamic = "force-dynamic";

/** Follows a public account, or sends a request to a private one. The author is named by public handle only. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`follow:${userId}`, 120, 3600);
  return NextResponse.json({ data: { status: await follow(userId, apiSegment(request, 1)) } });
});

/** Unfollows, or withdraws a pending request. */
export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`follow:${userId}`, 120, 3600);
  return NextResponse.json({ data: { status: await unfollow(userId, apiSegment(request, 1)) } });
});
