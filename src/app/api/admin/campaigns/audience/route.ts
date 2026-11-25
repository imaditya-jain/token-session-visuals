import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { audienceSize } from "@/server/services/campaigns";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "campaigns:read");
  return NextResponse.json({ data: { subscribers: await audienceSize() } });
});
