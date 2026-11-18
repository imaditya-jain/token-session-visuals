import { NextResponse } from "next/server";

import { forgotPasswordSchema } from "@/lib/auth-schemas";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { requestPasswordReset } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  await enforceRateLimit(`forgot:ip:${clientIp(request)}`, 10, 3600);
  const { email } = await readJson(request, forgotPasswordSchema);
  // Per-address limit stops someone flooding a victim's inbox with reset emails.
  await enforceRateLimit(`forgot:email:${email}`, 3, 3600);
  await requestPasswordReset(email);
  // Identical response whether or not the account exists.
  return NextResponse.json({ data: { accepted: true } }, { status: 202 });
});
