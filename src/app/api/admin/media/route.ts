import { NextResponse } from "next/server";

import { mediaListQuerySchema, mediaObjectId } from "@/lib/media";
import { requireAdmin } from "@/server/auth/guards";
import { AppError, badRequest } from "@/server/http/errors";
import { assertSameOrigin, clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { listMedia, MAX_UPLOAD_BYTES, uploadMedia } from "@/server/services/media";

export const dynamic = "force-dynamic";
// Shopify processes the image before it can be used; allow time for that.
export const maxDuration = 60;

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "media:manage");
  const query = mediaListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ data: await listMedia(query) });
});

/** Multipart upload: `file` (an image, up to 4 MB), an optional `alt` and an optional `folderId`. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "media:manage");
  await enforceRateLimit(`admin:media-upload:${admin.userId}`, 60, 3600);

  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data"))
    throw badRequest("Send the image as multipart form data.", "unsupported_media_type");
  // Refuse oversized bodies up front, before they are buffered (the multipart envelope adds a little).
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024)
    throw new AppError(413, "file_too_large", "Images can be up to 4 MB.");

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose an image to upload.", "file_required");
  const rawAlt = form.get("alt");
  const alt = typeof rawAlt === "string" ? rawAlt.trim().slice(0, 300) : "";
  const rawFolder = form.get("folderId");
  const folder =
    typeof rawFolder === "string" && rawFolder !== "" ? mediaObjectId.parse(rawFolder) : null;

  const media = await uploadMedia(
    admin.userId,
    { bytes: new Uint8Array(await file.arrayBuffer()), originalName: file.name },
    alt,
    folder,
  );
  await recordAudit({
    action: "media.uploaded",
    actorId: admin.userId,
    targetType: "media",
    targetId: media.id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { media } }, { status: 201 });
});
