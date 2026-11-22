import { NextResponse } from "next/server";

import { adminLoginSchema } from "@/lib/admin-schemas";
import { assertSameOrigin, clientIp, readJson, route, userAgent } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { startAdminLogin } from "@/server/services/admin-auth";

export const dynamic = "force-dynamic";

/** Step 1: password. Emails a one-time code and returns its handle; no session is opened here. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const ip = clientIp(request);
  await enforceRateLimit(`admin:login:ip:${ip}`, 20, 900);
  const input = await readJson(request, adminLoginSchema);
  await enforceRateLimit(`admin:login:acct:${input.email}`, 10, 900);
  const issued = await startAdminLogin(input, { ip, userAgent: userAgent(request) });
  return NextResponse.json({ data: issued });
});
