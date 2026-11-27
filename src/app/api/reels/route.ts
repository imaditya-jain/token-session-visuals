import { NextResponse } from "next/server";
import { z } from "zod";

import { createReelSchema, REEL_TOPICS } from "@/lib/reels";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate, authenticateOptional } from "@/server/services/auth";
import { createReel, listFeed } from "@/server/services/reels";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  cursor: z.string().max(40).optional(),
  topic: z.enum(REEL_TOPICS).optional(),
});

/** Live reels, newest first. Public: anyone may watch; liking and commenting need an account. */
export const GET = route(async ({ request }) => {
  const userId = await authenticateOptional(request.headers.get("authorization"));
  await enforceRateLimit(`reels:read:${userId ?? clientIp(request)}`, 240, 60);
  const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ data: await listFeed(userId, query) });
});

/** Reserves a reel and returns the one-time upload address. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`reels:create:${userId}`, 20, 3600);
  const input = await readJson(request, createReelSchema);
  return NextResponse.json({ data: await createReel(userId, input) }, { status: 201 });
});
