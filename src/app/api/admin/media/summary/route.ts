import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { mediaSummary } from "@/server/services/media";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "media:manage");
  return NextResponse.json({ data: await mediaSummary() });
});
