import { NextResponse } from "next/server";

import { mediaPatchSchema } from "@/lib/media";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { deleteMedia, getMedia, updateMedia } from "@/server/services/media";
import { mediaIdAt } from "@/server/services/media-route";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "media:manage");
  return NextResponse.json({ data: await getMedia(mediaIdAt(request, 4)) });
});

export const PATCH = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "media:manage");
  await enforceRateLimit(`admin:media-write:${admin.userId}`, 120, 3600);
  const id = mediaIdAt(request, 4);
  const patch = await readJson(request, mediaPatchSchema);
  const media = await updateMedia(id, patch);
  await recordAudit({
    action: "media.updated",
    actorId: admin.userId,
    targetType: "media",
    targetId: id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { media } });
});

export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "media:manage");
  await enforceRateLimit(`admin:media-write:${admin.userId}`, 120, 3600);
  const id = mediaIdAt(request, 4);
  await deleteMedia(id);
  await recordAudit({
    action: "media.deleted",
    actorId: admin.userId,
    targetType: "media",
    targetId: id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { deleted: true } });
});
