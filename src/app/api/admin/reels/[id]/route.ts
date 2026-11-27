import { NextResponse } from "next/server";

import { moderateReelSchema } from "@/lib/reels";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { apiSegment } from "@/server/reels/path";
import { recordAudit } from "@/server/services/audit";
import { moderateReel } from "@/server/services/reels";

export const dynamic = "force-dynamic";

export const PATCH = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "reels:moderate");
  await enforceRateLimit(`admin:reels:${admin.userId}`, 600, 3600);
  const id = apiSegment(request, 2);
  const { status } = await readJson(request, moderateReelSchema);
  const reel = await moderateReel(admin.userId, id, status);
  await recordAudit({
    action: `reel.${status}`,
    actorId: admin.userId,
    targetType: "reel",
    targetId: id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { reel } });
});
