import { NextResponse } from "next/server";

import { otpResendSchema } from "@/lib/auth-schemas";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { resendOtp } from "@/server/services/otp";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  await enforceRateLimit(`otp:resend:ip:${clientIp(request)}`, 10, 900);
  const { challenge } = await readJson(request, otpResendSchema);
  return NextResponse.json({ data: await resendOtp(challenge, "customer_login") });
});
