import { registerSchema } from "@/lib/auth-schemas";
import { assertSameOrigin, clientIp, readJson, route, userAgent } from "@/server/http/handler";
import { sessionResponse } from "@/server/http/session-response";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { registerUser } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const ip = clientIp(request);
  await enforceRateLimit(`register:ip:${ip}`, 10, 3600);
  const input = await readJson(request, registerSchema);
  return sessionResponse(await registerUser(input, { ip, userAgent: userAgent(request) }), 201);
});
