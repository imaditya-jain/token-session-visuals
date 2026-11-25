import "server-only";

import type { NextRequest } from "next/server";

import { campaignGid } from "@/lib/campaigns";
import { notFound } from "@/server/http/errors";

/** The `[id]` segment of `/api/admin/campaigns/[id]/…` (404 unless it is a valid id). */
export function campaignIdFrom(request: NextRequest): string {
  const parsed = campaignGid.safeParse(request.nextUrl.pathname.split("/")[4] ?? "");
  if (!parsed.success) throw notFound("Campaign not found", "campaign_not_found");
  return parsed.data;
}
