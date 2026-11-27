import { NextResponse } from "next/server";

import { assertSameOrigin, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { apiSegment } from "@/server/reels/path";
import { authenticate } from "@/server/services/auth";
import { setLike } from "@/server/services/reels";

export const dynamic = "force-dynamic";

const handle = (liked: boolean) =>
  route(async ({ request }) => {
    assertSameOrigin(request);
    const { userId } = await authenticate(request.headers.get("authorization"));
    await enforceRateLimit(`reels:like:${userId}`, 120, 60);
    return NextResponse.json({ data: await setLike(userId, apiSegment(request, 1), liked) });
  });

export const POST = handle(true);
export const DELETE = handle(false);
