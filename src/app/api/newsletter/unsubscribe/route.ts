import { NextResponse } from "next/server";

import { newsletterTokenSchema } from "@/lib/newsletter-schemas";
import { badRequest } from "@/server/http/errors";
import { clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { unsubscribe } from "@/server/services/newsletter";

export const dynamic = "force-dynamic";

/**
 * Unsubscribe by signed token. Deliberately has NO Origin check: RFC 8058 one-click unsubscribe is a POST made
 * by the recipient's mailbox provider, which carries no Origin. The HMAC token is the authorization.
 * The token comes from the query string (one-click) or the JSON body (our confirmation page).
 */
export const POST = route(async ({ request }) => {
  await enforceRateLimit(`unsubscribe:ip:${clientIp(request)}`, 60, 3600);
  const fromQuery = request.nextUrl.searchParams.get("token");
  const token = fromQuery ?? (await readJson(request, newsletterTokenSchema)).token;
  if (!token) throw badRequest("Missing token", "invalid_token");
  await unsubscribe(token);
  return NextResponse.json({ data: { unsubscribed: true } });
});
