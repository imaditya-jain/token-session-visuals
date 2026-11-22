import { NextResponse } from "next/server";

import { loginSchema } from "@/lib/auth-schemas";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { startCustomerLogin } from "@/server/services/admin-auth";

export const dynamic = "force-dynamic";

/** Step 1: email + password. Emails a one-time code and returns its handle; no session is opened here. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  await enforceRateLimit(`login:ip:${clientIp(request)}`, 30, 900);
  const input = await readJson(request, loginSchema);
  // Per-account limit stops distributed guessing; the account also locks after repeated failures.
  await enforceRateLimit(`login:acct:${input.email}`, 10, 900);
  return NextResponse.json({ data: await startCustomerLogin(input) });
});
