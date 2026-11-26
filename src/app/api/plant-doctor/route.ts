import { NextResponse } from "next/server";

import { ACCEPTED_IMAGE_TYPES, MAX_NOTES_LENGTH, MAX_UPLOAD_BYTES } from "@/lib/plant-doctor";
import { AppError, badRequest } from "@/server/http/errors";
import { assertSameOrigin, clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import { diagnose, listChecks, plantDoctorEnabled } from "@/server/services/plant-doctor";

export const dynamic = "force-dynamic";
/** The model may think for a while on a hard photo; the platform's 60 s ceiling is the limit. */
export const maxDuration = 120;

/** Past checks (newest first) and whether the feature is switched on. Only the caller's own. */
export const GET = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`plant-doctor:read:${userId}`, 120, 60);
  return NextResponse.json({
    data: { enabled: plantDoctorEnabled(), items: await listChecks(userId) },
  });
});

/** One photo (multipart: `photo`, optional `notes`) in, one diagnosis out. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`plant-doctor:ip-all:${clientIp(request)}`, 120, 3600);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    throw new AppError(
      413,
      "payload_too_large",
      "That photo is too large. Please use a smaller one.",
    );
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    throw badRequest("Send the photo as multipart form data.", "unsupported_media_type");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest("We couldn't read the upload.", "invalid_form");
  }
  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0)
    throw badRequest("Add a photo of your plant.", "photo_required");
  if (photo.size > MAX_UPLOAD_BYTES) {
    throw new AppError(
      413,
      "payload_too_large",
      "That photo is too large. Please use a smaller one.",
    );
  }
  if (photo.type && !(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(photo.type)) {
    throw new AppError(415, "unsupported_image", "Please upload a JPEG, PNG or WebP photo.");
  }
  const notes = form.get("notes");
  if (notes !== null && typeof notes !== "string")
    throw badRequest("Notes must be text.", "invalid_notes");
  if (typeof notes === "string" && notes.length > MAX_NOTES_LENGTH * 2) {
    throw badRequest(`Keep your notes under ${MAX_NOTES_LENGTH} characters.`, "notes_too_long");
  }

  const record = await diagnose({
    userId,
    ip: clientIp(request),
    image: new Uint8Array(await photo.arrayBuffer()),
    notes: typeof notes === "string" ? notes : null,
  });
  return NextResponse.json({ data: record }, { status: 201 });
});
