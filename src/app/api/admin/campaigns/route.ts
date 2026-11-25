import { NextResponse } from "next/server";
import { z } from "zod";

import { campaignInputSchema, CAMPAIGN_STATUSES } from "@/lib/campaigns";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { createCampaign, listCampaigns } from "@/server/services/campaigns";

export const dynamic = "force-dynamic";

const listQuery = z.object({ status: z.enum(CAMPAIGN_STATUSES).optional() });

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "campaigns:read");
  const { status } = listQuery.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ data: { campaigns: await listCampaigns(status) } });
});

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "campaigns:write");
  await enforceRateLimit(`admin:campaign-write:${admin.userId}`, 120, 3600);
  const input = await readJson(request, campaignInputSchema, { maxBytes: 100_000 });
  const campaign = await createCampaign(admin.userId, input);
  await recordAudit({
    action: "campaign.created",
    actorId: admin.userId,
    targetType: "campaign",
    targetId: campaign.id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { campaign } }, { status: 201 });
});
