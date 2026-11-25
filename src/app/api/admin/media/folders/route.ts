import { NextResponse } from "next/server";

import { folderInputSchema } from "@/lib/media";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { createFolder, listFolders } from "@/server/services/media";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "media:manage");
  return NextResponse.json({ data: { folders: await listFolders() } });
});

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "media:manage");
  await enforceRateLimit(`admin:media-write:${admin.userId}`, 120, 3600);
  const { name } = await readJson(request, folderInputSchema);
  const folder = await createFolder(admin.userId, name);
  await recordAudit({
    action: "media.folder_changed",
    actorId: admin.userId,
    targetType: "media-folder",
    targetId: folder.id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { folder } }, { status: 201 });
});
