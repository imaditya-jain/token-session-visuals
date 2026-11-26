import { otpVerifySchema } from "@/lib/auth-schemas";
import { forbidden } from "@/server/http/errors";
import { clientIp, isNativeClient, readJson, route, userAgent } from "@/server/http/handler";
import { nativeSessionResponse } from "@/server/http/native-session";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { completeCustomerOtp } from "@/server/services/admin-auth";

export const dynamic = "force-dynamic";

/** Second step of mobile sign-in (the emailed code). Opens a session and returns the refresh token in the body. */
export const POST = route(async ({ request }) => {
  if (!isNativeClient(request)) throw forbidden("Not available", "native_client_required");
  const ip = clientIp(request);
  await enforceRateLimit(`otp:verify:ip:${ip}`, 30, 900);
  const { challenge, code } = await readJson(request, otpVerifySchema);
  return nativeSessionResponse(
    await completeCustomerOtp(challenge, code, { ip, userAgent: userAgent(request) }),
  );
});
