import { NextResponse } from "next/server";

import { subscribeSchema } from "@/lib/newsletter-schemas";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { subscribe } from "@/server/services/newsletter";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  await enforceRateLimit(`newsletter:ip:${clientIp(request)}`, 10, 3600);
  const { email } = await readJson(request, subscribeSchema);
  // Per-address limit stops someone using the form to flood a victim's inbox.
  await enforceRateLimit(`newsletter:email:${email}`, 3, 3600);
  await subscribe(email, "footer");
  return NextResponse.json({ data: { accepted: true } }, { status: 202 });
});
