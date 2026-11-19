import { NextResponse } from "next/server";

import { contactSchema } from "@/lib/contact-schemas";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { submitContactMessage } from "@/server/services/contact";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  await enforceRateLimit(`contact:ip:${clientIp(request)}`, 5, 3600);
  const input = await readJson(request, contactSchema);
  // Per-address cap keeps one sender from flooding the shop inbox from many IPs.
  await enforceRateLimit(`contact:email:${input.email}`, 3, 3600);
  await submitContactMessage(input);
  return NextResponse.json({ data: { accepted: true } }, { status: 202 });
});
