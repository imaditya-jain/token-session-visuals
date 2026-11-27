import { NextResponse } from "next/server";

import { assertSameOrigin, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { apiSegment } from "@/server/reels/path";
import { authenticate } from "@/server/services/auth";
import { answerRequest } from "@/server/services/reel-social";

export const dynamic = "force-dynamic";

const answer = (approve: boolean) =>
  route(async ({ request }) => {
    assertSameOrigin(request);
    const { userId } = await authenticate(request.headers.get("authorization"));
    await enforceRateLimit(`follow:${userId}`, 240, 3600);
    await answerRequest(userId, apiSegment(request, 2), approve);
    return new NextResponse(null, { status: 204 });
  });

/** Accepts the request from the person with this handle. */
export const POST = answer(true);
/** Declines it. */
export const DELETE = answer(false);
