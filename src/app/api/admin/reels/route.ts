import { NextResponse } from "next/server";
import { z } from "zod";

import { REEL_STATUSES } from "@/lib/reels";
import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { listForModeration } from "@/server/services/reels";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(REEL_STATUSES).default("pending"),
  cursor: z.string().max(40).optional(),
});

export const GET = route(async ({ request }) => {
  const admin = await requireAdmin(request, "reels:moderate");
  const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ data: await listForModeration(admin.userId, query) });
});
