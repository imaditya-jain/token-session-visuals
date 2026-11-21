import { NextResponse } from "next/server";

import { wholesaleSchema } from "@/lib/wholesale-schemas";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { submitWholesaleApplication } from "@/server/services/wholesale";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  await enforceRateLimit(`wholesale:ip:${clientIp(request)}`, 5, 3600);
  const input = await readJson(request, wholesaleSchema);
  // Per-address cap keeps one sender from flooding the shop inbox from many IPs.
  await enforceRateLimit(`wholesale:email:${input.email}`, 3, 3600);
  await submitWholesaleApplication(input);
  return NextResponse.json({ data: { accepted: true } }, { status: 202 });
});
