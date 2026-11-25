import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { discardPageDraft } from "@/server/services/page-content";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "site:write");
  await enforceRateLimit(`admin:site-publish:${admin.userId}`, 60, 3600);
  const page = request.nextUrl.pathname.split("/")[4] ?? "";
  const saved = await discardPageDraft(admin.userId, page);
  await recordAudit({
    action: "page.discarded",
    actorId: admin.userId,
    targetType: "site",
    targetId: `page:${page}`,
    ip: clientIp(request),
  });

  return NextResponse.json({ data: saved });
});
