import { NextResponse } from "next/server";

import { subscriptionActionSchema } from "@/lib/subscriptions";
import { requireAdmin } from "@/server/auth/guards";
import { notFound } from "@/server/http/errors";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { changeSubscription, readSubscription } from "@/server/services/subscriptions";

export const dynamic = "force-dynamic";

const idFrom = (pathname: string): string => {
  const id = pathname.split("/").pop() ?? "";
  if (!/^\d{1,20}$/.test(id)) throw notFound("Subscription not found", "subscription_not_found");
  return id;
};

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "subscriptions:read");
  return NextResponse.json({
    data: { subscription: await readSubscription(idFrom(request.nextUrl.pathname)) },
  });
});

export const PUT = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "subscriptions:write");
  await enforceRateLimit(`admin:subscription-write:${admin.userId}`, 60, 3600);
  const id = idFrom(request.nextUrl.pathname);
  const { action } = await readJson(request, subscriptionActionSchema);
  const subscription = await changeSubscription(id, action);
  await recordAudit({
    action: "subscription.changed",
    actorId: admin.userId,
    targetType: "subscription",
    targetId: id,
    meta: { action },
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { subscription } });
});
