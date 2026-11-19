import { NextResponse } from "next/server";

import { newsletterTokenSchema } from "@/lib/newsletter-schemas";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { confirmSubscription } from "@/server/services/newsletter";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  await enforceRateLimit(`newsletter-confirm:ip:${clientIp(request)}`, 30, 3600);
  const { token } = await readJson(request, newsletterTokenSchema);
  await confirmSubscription(token);
  return NextResponse.json({ data: { subscribed: true } });
});
