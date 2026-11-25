import { NextResponse } from "next/server";

import { revalidateBlog } from "@/server/blog/revalidate";
import { requireAdmin } from "@/server/auth/guards";
import { AppError, badRequest } from "@/server/http/errors";
import { assertSameOrigin, clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { MAX_UPLOAD_BYTES, replaceMedia } from "@/server/services/media";
import { mediaIdAt } from "@/server/services/media-route";
import { revalidatePageContent, revalidateSiteChrome } from "@/server/site/revalidate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Multipart `file`: replaces the picture everywhere it is used (same library entry, same Shopify file). */
export const PUT = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "media:manage");
  await enforceRateLimit(`admin:media-upload:${admin.userId}`, 60, 3600);
  const id = mediaIdAt(request, 4);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data"))
    throw badRequest("Send the image as multipart form data.", "unsupported_media_type");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024)
    throw new AppError(413, "file_too_large", "Images can be up to 4 MB.");
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose an image to upload.", "file_required");

  const result = await replaceMedia(id, {
    bytes: new Uint8Array(await file.arrayBuffer()),
    originalName: file.name,
  });
  await recordAudit({
    action: "media.replaced",
    actorId: admin.userId,
    targetType: "media",
    targetId: id,
    meta: { updatedReferences: result.updatedReferences },
    ip: clientIp(request),
  });
  if (result.updatedReferences > 0) {
    revalidateBlog();
    revalidateSiteChrome();
    revalidatePageContent("/");
  }
  return NextResponse.json({ data: result });
});
