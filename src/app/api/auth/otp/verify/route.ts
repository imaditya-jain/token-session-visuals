import { otpVerifySchema } from "@/lib/admin-schemas";
import { assertSameOrigin, clientIp, readJson, route, userAgent } from "@/server/http/handler";
import { sessionResponse } from "@/server/http/session-response";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { completeCustomerOtp } from "@/server/services/admin-auth";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const ip = clientIp(request);
  await enforceRateLimit(`otp:verify:ip:${ip}`, 30, 900);
  const { challenge, code } = await readJson(request, otpVerifySchema);
  return sessionResponse(
    await completeCustomerOtp(challenge, code, { ip, userAgent: userAgent(request) }),
  );
});
