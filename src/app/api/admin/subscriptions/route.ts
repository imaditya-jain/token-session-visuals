import { NextResponse } from "next/server";

import { subscriptionListQuerySchema } from "@/lib/subscriptions";
import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { fetchSubscriptions } from "@/server/services/subscriptions";

export const dynamic = "force-dynamic";

/** Gardening subscriptions, live from Seal Subscriptions (the billing provider). */
export const GET = route(async ({ request }) => {
  await requireAdmin(request, "subscriptions:read");
  const query = subscriptionListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ data: await fetchSubscriptions(query) });
});
