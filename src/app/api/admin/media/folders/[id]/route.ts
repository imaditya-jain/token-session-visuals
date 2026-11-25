import { NextResponse } from "next/server";

import { folderInputSchema } from "@/lib/media";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { deleteFolder, renameFolder } from "@/server/services/media";
import { mediaIdAt } from "@/server/services/media-route";

export const dynamic = "force-dynamic";

export const PATCH = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "media:manage");
  await enforceRateLimit(`admin:media-write:${admin.userId}`, 120, 3600);
  const id = mediaIdAt(request, 5);
  const { name } = await readJson(request, folderInputSchema);
  await renameFolder(id, name);
  await recordAudit({
    action: "media.folder_changed",
    actorId: admin.userId,
    targetType: "media-folder",
    targetId: id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { renamed: true } });
});

export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "media:manage");
  const id = mediaIdAt(request, 5);
  await deleteFolder(id);
  await recordAudit({
    action: "media.folder_changed",
    actorId: admin.userId,
    targetType: "media-folder",
    targetId: id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { deleted: true } });
});
