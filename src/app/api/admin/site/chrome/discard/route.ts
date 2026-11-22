import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { discardChromeDraft } from "@/server/services/site-chrome";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "site:write");
  await enforceRateLimit(`admin:site-write:${admin.userId}`, 240, 3600);
  const chrome = await discardChromeDraft(admin.userId);
  await recordAudit({
    action: "site.chrome_draft_discarded",
    actorId: admin.userId,
    targetType: "site",
    targetId: "chrome",
    ip: clientIp(request),
  });
  return NextResponse.json({ data: chrome });
});
