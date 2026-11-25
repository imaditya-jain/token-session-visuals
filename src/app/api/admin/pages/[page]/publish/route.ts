import { NextResponse } from "next/server";

import { pageDef } from "@/lib/page-content";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { publishPage } from "@/server/services/page-content";
import { revalidatePageContent } from "@/server/site/revalidate";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "site:publish");
  await enforceRateLimit(`admin:site-publish:${admin.userId}`, 60, 3600);
  const page = request.nextUrl.pathname.split("/")[4] ?? "";
  const saved = await publishPage(admin.userId, page);
  await recordAudit({
    action: "page.published",
    actorId: admin.userId,
    targetType: "site",
    targetId: `page:${page}`,
    ip: clientIp(request),
  });
  revalidatePageContent(pageDef(page)?.path ?? "/");
  return NextResponse.json({ data: saved });
});
