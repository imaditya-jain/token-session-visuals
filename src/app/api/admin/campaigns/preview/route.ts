import { NextResponse } from "next/server";

import { previewSchema } from "@/lib/campaigns";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { previewCampaign } from "@/server/services/campaigns";

export const dynamic = "force-dynamic";

/** Renders what a subscriber would receive. Nothing is stored or sent. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "campaigns:read");
  await enforceRateLimit(`admin:campaign-preview:${admin.userId}`, 600, 3600);
  const input = await readJson(request, previewSchema, { maxBytes: 100_000 });
  return NextResponse.json({ data: { html: await previewCampaign(input) } });
});
