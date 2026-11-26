import { registerSchema } from "@/lib/auth-schemas";
import { forbidden } from "@/server/http/errors";
import { clientIp, isNativeClient, readJson, route, userAgent } from "@/server/http/handler";
import { nativeSessionResponse } from "@/server/http/native-session";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { registerUser } from "@/server/services/auth";

export const dynamic = "force-dynamic";

/** Mobile sign-up: same as the website's, but the refresh token comes back in the body. */
export const POST = route(async ({ request }) => {
  if (!isNativeClient(request)) throw forbidden("Not available", "native_client_required");
  const ip = clientIp(request);
  await enforceRateLimit(`register:ip:${ip}`, 10, 3600);
  const input = await readJson(request, registerSchema);
  return nativeSessionResponse(
    await registerUser(input, { ip, userAgent: userAgent(request) }),
    201,
  );
});
