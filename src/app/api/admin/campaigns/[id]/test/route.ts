import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { getProfile } from "@/server/services/auth";
import { campaignIdFrom } from "@/server/services/campaign-route";
import { sendTest } from "@/server/services/campaigns";

export const dynamic = "force-dynamic";

/** Sends the campaign to the signed-in admin's own address only. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "campaigns:write");
  await enforceRateLimit(`admin:campaign-test:${admin.userId}`, 20, 3600);
  const id = campaignIdFrom(request);
  const profile = await getProfile(admin.userId);
  await sendTest(id, profile.email);
  await recordAudit({
    action: "campaign.test_sent",
    actorId: admin.userId,
    targetType: "campaign",
    targetId: id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { sentTo: profile.email } });
});
