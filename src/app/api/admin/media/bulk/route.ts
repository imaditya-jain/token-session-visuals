import { NextResponse } from "next/server";

import { mediaBulkSchema } from "@/lib/media";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { deleteUnused, moveMedia } from "@/server/services/media";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** `delete-unused` removes only the chosen pictures nothing uses; `move` files them in a folder (or none). */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "media:manage");
  await enforceRateLimit(`admin:media-write:${admin.userId}`, 120, 3600);
  const input = await readJson(request, mediaBulkSchema);
  if (input.action === "move") {
    const moved = await moveMedia(input.ids, input.folderId);
    await recordAudit({
      action: "media.moved",
      actorId: admin.userId,
      targetType: "media",
      meta: { count: moved },
      ip: clientIp(request),
    });
    return NextResponse.json({ data: { moved } });
  }
  const result = await deleteUnused(input.ids);
  await recordAudit({
    action: "media.deleted",
    actorId: admin.userId,
    targetType: "media",
    meta: { ...result },
    ip: clientIp(request),
  });
  return NextResponse.json({ data: result });
});
