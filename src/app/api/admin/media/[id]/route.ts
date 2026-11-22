import { NextResponse } from "next/server";

import { mediaAltSchema } from "@/lib/blog-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { deleteMedia, updateMediaAlt } from "@/server/services/media";

export const dynamic = "force-dynamic";

const idOf = (pathname: string) => pathname.split("/").pop() ?? "";

export const PATCH = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "media:manage");
  await enforceRateLimit(`admin:media-write:${admin.userId}`, 120, 3600);
  const { alt } = await readJson(request, mediaAltSchema);
  return NextResponse.json({
    data: { media: await updateMediaAlt(idOf(request.nextUrl.pathname), alt) },
  });
});

export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "media:manage");
  await enforceRateLimit(`admin:media-write:${admin.userId}`, 120, 3600);
  const id = idOf(request.nextUrl.pathname);
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
