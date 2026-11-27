import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { apiSegment } from "@/server/reels/path";
import { recordAudit } from "@/server/services/audit";
import { removeCommentAsAdmin } from "@/server/services/reels";

export const dynamic = "force-dynamic";

export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "reels:moderate");
  await enforceRateLimit(`admin:reels:${admin.userId}`, 600, 3600);
  const commentId = apiSegment(request, 4);
  await removeCommentAsAdmin(apiSegment(request, 2), commentId);
  await recordAudit({
    action: "reel.comment.removed",
    actorId: admin.userId,
    targetType: "reel-comment",
    targetId: commentId,
    ip: clientIp(request),
  });
  return new NextResponse(null, { status: 204 });
});
