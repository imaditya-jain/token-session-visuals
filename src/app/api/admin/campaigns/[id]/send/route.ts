import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { campaignIdFrom } from "@/server/services/campaign-route";
import { sendCampaign } from "@/server/services/campaigns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "campaigns:send");
  await enforceRateLimit(`admin:campaign-send:${admin.userId}`, 10, 3600);
  const id = campaignIdFrom(request);
  const campaign = await sendCampaign(admin.userId, id);
  await recordAudit({
    action: "campaign.sent",
    actorId: admin.userId,
    targetType: "campaign",
    targetId: id,
    meta: { queued: campaign.stats?.queued ?? 0 },
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { campaign } });
});
