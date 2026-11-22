import { NextResponse } from "next/server";

import { customerOtpRequestSchema } from "@/lib/admin-schemas";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { startCustomerOtp } from "@/server/services/admin-auth";

export const dynamic = "force-dynamic";

/** Emails a sign-in code. The answer is identical whether or not the address has an account. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  await enforceRateLimit(`otp:request:ip:${clientIp(request)}`, 10, 3600);
  const { email } = await readJson(request, customerOtpRequestSchema);
  await enforceRateLimit(`otp:request:email:${email}`, 5, 3600);
  return NextResponse.json({ data: await startCustomerOtp(email) });
});
