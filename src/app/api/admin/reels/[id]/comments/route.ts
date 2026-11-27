import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { apiSegment } from "@/server/reels/path";
import { listCommentsForModeration } from "@/server/services/reels";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  const admin = await requireAdmin(request, "reels:moderate");
  const comments = await listCommentsForModeration(admin.userId, apiSegment(request, 2));
  return NextResponse.json({ data: { comments } });
});
