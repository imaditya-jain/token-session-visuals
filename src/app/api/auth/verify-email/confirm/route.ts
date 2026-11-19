import { NextResponse } from "next/server";

import { confirmTokenSchema } from "@/lib/auth-schemas";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { confirmEmailVerification } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  await enforceRateLimit(`verify-confirm:ip:${clientIp(request)}`, 30, 3600);
  const { token } = await readJson(request, confirmTokenSchema);
  await confirmEmailVerification(token);
  return NextResponse.json({ data: { verified: true } });
});
