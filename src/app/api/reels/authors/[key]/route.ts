import { NextResponse } from "next/server";
import { z } from "zod";

import { clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { apiSegment } from "@/server/reels/path";
import { authenticateOptional } from "@/server/services/auth";
import { getAuthor } from "@/server/services/reels";

export const dynamic = "force-dynamic";

const querySchema = z.object({ cursor: z.string().max(40).optional() });

/** A profile with its live posts and reels. Public, but a private account's items need an accepted follow. */
export const GET = route(async ({ request }) => {
  const userId = await authenticateOptional(request.headers.get("authorization"));
  await enforceRateLimit(`reels:read:${userId ?? clientIp(request)}`, 240, 60);
  const { cursor } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ data: await getAuthor(userId, apiSegment(request, 2), cursor) });
});
