import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { getAdminPage, savePageDraft } from "@/server/services/page-content";

export const dynamic = "force-dynamic";

const pageFrom = (pathname: string): string => pathname.split("/")[4] ?? "";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "site:write");
  return NextResponse.json({ data: await getAdminPage(pageFrom(request.nextUrl.pathname)) });
});

/** Saves the whole draft of one page. Nothing is visible on the storefront until it is published. */
export const PUT = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "site:write");
  await enforceRateLimit(`admin:site-write:${admin.userId}`, 240, 3600);
  const page = pageFrom(request.nextUrl.pathname);
  const body: unknown = await request.json().catch(() => null);
  const saved = await savePageDraft(admin.userId, page, body);
  await recordAudit({
    action: "page.draft_saved",
    actorId: admin.userId,
    targetType: "site",
    targetId: `page:${page}`,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: saved });
});
