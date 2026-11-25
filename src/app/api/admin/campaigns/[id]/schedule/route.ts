import { NextResponse } from "next/server";

import { scheduleSchema } from "@/lib/campaigns";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { campaignIdFrom } from "@/server/services/campaign-route";
import { scheduleCampaign, unscheduleCampaign } from "@/server/services/campaigns";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "campaigns:send");
  await enforceRateLimit(`admin:campaign-send:${admin.userId}`, 30, 3600);
  const id = campaignIdFrom(request);
  const { at } = await readJson(request, scheduleSchema);
  const campaign = await scheduleCampaign(admin.userId, id, new Date(at));
  await recordAudit({
    action: "campaign.scheduled",
    actorId: admin.userId,
    targetType: "campaign",
    targetId: id,
    meta: { at },
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { campaign } });
});

export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "campaigns:send");
  const id = campaignIdFrom(request);
  const campaign = await unscheduleCampaign(admin.userId, id);
  await recordAudit({
    action: "campaign.unscheduled",
    actorId: admin.userId,
    targetType: "campaign",
    targetId: id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { campaign } });
});
