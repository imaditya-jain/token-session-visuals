import { NextResponse } from "next/server";

import { chromeDraftSchema } from "@/lib/site-chrome";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { getAdminChrome, saveChromeDraft } from "@/server/services/site-chrome";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "site:write");
  return NextResponse.json({ data: await getAdminChrome() });
});

/** Saves the whole draft. Nothing is visible on the storefront until it is published. */
export const PUT = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "site:write");
  await enforceRateLimit(`admin:site-write:${admin.userId}`, 240, 3600);
  const chrome = await readJson(request, chromeDraftSchema, { maxBytes: 100_000 });
  const saved = await saveChromeDraft(admin.userId, chrome);
  await recordAudit({
    action: "site.chrome_draft_saved",
    actorId: admin.userId,
    targetType: "site",
    targetId: "chrome",
    ip: clientIp(request),
  });
  return NextResponse.json({ data: saved });
});
