import { NextResponse } from "next/server";

import { route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import { listRequests } from "@/server/services/reel-social";

export const dynamic = "force-dynamic";

/** Follow requests waiting for this account's answer (only ever the caller's own). */
export const GET = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`follow-read:${userId}`, 120, 60);
  return NextResponse.json({ data: { requests: await listRequests(userId) } });
});
