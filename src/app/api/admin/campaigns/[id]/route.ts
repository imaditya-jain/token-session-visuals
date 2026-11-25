import { NextResponse } from "next/server";

import { campaignGid, campaignInputSchema } from "@/lib/campaigns";
import { requireAdmin } from "@/server/auth/guards";
import { notFound } from "@/server/http/errors";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { deleteCampaign, getCampaign, updateCampaign } from "@/server/services/campaigns";

export const dynamic = "force-dynamic";

const idFrom = (pathname: string): string => {
  const parsed = campaignGid.safeParse(pathname.split("/")[4] ?? "");
  if (!parsed.success) throw notFound("Campaign not found", "campaign_not_found");
  return parsed.data;
};

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "campaigns:read");
  return NextResponse.json({
    data: { campaign: await getCampaign(idFrom(request.nextUrl.pathname)) },
  });
});

export const PUT = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "campaigns:write");
  await enforceRateLimit(`admin:campaign-write:${admin.userId}`, 240, 3600);
  const id = idFrom(request.nextUrl.pathname);
  const input = await readJson(request, campaignInputSchema, { maxBytes: 100_000 });
  const campaign = await updateCampaign(admin.userId, id, input);
  await recordAudit({
    action: "campaign.updated",
    actorId: admin.userId,
    targetType: "campaign",
    targetId: id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { campaign } });
});

export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "campaigns:write");
  const id = idFrom(request.nextUrl.pathname);
  await deleteCampaign(id);
  await recordAudit({
    action: "campaign.deleted",
    actorId: admin.userId,
    targetType: "campaign",
    targetId: id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { deleted: true } });
});
