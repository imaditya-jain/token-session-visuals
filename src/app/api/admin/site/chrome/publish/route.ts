import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { publishChrome } from "@/server/services/site-chrome";
import { revalidateSiteChrome } from "@/server/site/revalidate";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "site:publish");
  await enforceRateLimit(`admin:site-publish:${admin.userId}`, 60, 3600);
  const { chrome, hidden } = await publishChrome(admin.userId);
  await recordAudit({
    action: "site.chrome_published",
    actorId: admin.userId,
    targetType: "site",
    targetId: "chrome",
    meta: { hiddenSocial: hidden.length },
    ip: clientIp(request),
  });
  revalidateSiteChrome();
  return NextResponse.json({ data: { ...chrome, hidden } });
});
