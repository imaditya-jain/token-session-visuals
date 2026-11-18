import { NextResponse } from "next/server";

import { resetPasswordSchema } from "@/lib/auth-schemas";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { resetPassword } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  await enforceRateLimit(`reset:ip:${clientIp(request)}`, 20, 3600);
  const { token, password } = await readJson(request, resetPasswordSchema);
  await resetPassword(token, password);
  return NextResponse.json({ data: { reset: true } });
});
