import "server-only";

import type { NextRequest } from "next/server";

import { mediaObjectId } from "@/lib/media";
import { notFound } from "@/server/http/errors";

/** Segment `index` of `/api/admin/media/…` as a validated id (404 unless it is one). */
export function mediaIdAt(request: NextRequest, index: number): string {
  const parsed = mediaObjectId.safeParse(request.nextUrl.pathname.split("/")[index] ?? "");
  if (!parsed.success) throw notFound("Media not found", "media_not_found");
  return parsed.data;
}
