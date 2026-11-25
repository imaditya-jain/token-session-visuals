import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { listAdminPages } from "@/server/services/page-content";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "site:write");
  return NextResponse.json({ data: { pages: await listAdminPages() } });
});
