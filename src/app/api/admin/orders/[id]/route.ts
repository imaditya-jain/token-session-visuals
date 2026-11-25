import { NextResponse } from "next/server";

import { updateOrderSchema } from "@/lib/orders-admin";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { readOrder, updateOrder } from "@/server/services/order-admin";
import { orderGidFrom } from "@/server/shopify/order-route";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "orders:read");
  return NextResponse.json({ data: { order: await readOrder(orderGidFrom(request)) } });
});

/** Edits the internal note and tags only; money and items can't be changed here. */
export const PATCH = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "orders:write");
  await enforceRateLimit(`admin:order-write:${admin.userId}`, 200, 3600);
  const id = orderGidFrom(request);
  const patch = await readJson(request, updateOrderSchema);
  const order = await updateOrder(id, patch);
  await recordAudit({
    action: "order.updated",
    actorId: admin.userId,
    targetType: "order",
    targetId: id,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { order } });
});
