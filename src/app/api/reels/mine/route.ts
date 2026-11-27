import { NextResponse } from "next/server";

import { route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import { listMine } from "@/server/services/reels";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`reels:read:${userId}`, 240, 60);
  return NextResponse.json({ data: { reels: await listMine(userId) } });
});
