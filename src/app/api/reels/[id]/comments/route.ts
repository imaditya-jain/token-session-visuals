import { NextResponse } from "next/server";
import { z } from "zod";

import { commentSchema } from "@/lib/reels";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { apiSegment } from "@/server/reels/path";
import { authenticate, authenticateOptional } from "@/server/services/auth";
import { addComment, listComments } from "@/server/services/reels";

export const dynamic = "force-dynamic";

const querySchema = z.object({ cursor: z.string().max(40).optional() });

export const GET = route(async ({ request }) => {
  const userId = await authenticateOptional(request.headers.get("authorization"));
  await enforceRateLimit(`reels:read:${userId ?? clientIp(request)}`, 240, 60);
  const { cursor } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ data: await listComments(userId, apiSegment(request, 1), cursor) });
});

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`reels:comment:${userId}`, 30, 3600);
  const { text } = await readJson(request, commentSchema);
  const comment = await addComment(userId, apiSegment(request, 1), text);
  return NextResponse.json({ data: { comment } }, { status: 201 });
});
