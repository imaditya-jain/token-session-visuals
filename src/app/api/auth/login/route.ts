import { loginSchema } from "@/lib/auth-schemas";
import { assertSameOrigin, clientIp, readJson, route, userAgent } from "@/server/http/handler";
import { sessionResponse } from "@/server/http/session-response";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { loginUser } from "@/server/services/auth";

export const dynamic = "force-dynamic";

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const ip = clientIp(request);
  await enforceRateLimit(`login:ip:${ip}`, 30, 900);
  const input = await readJson(request, loginSchema);
  // Per-account limit stops distributed guessing; the account also locks after repeated failures.
  await enforceRateLimit(`login:acct:${input.email}`, 10, 900);
  return sessionResponse(await loginUser(input, { ip, userAgent: userAgent(request) }));
});
