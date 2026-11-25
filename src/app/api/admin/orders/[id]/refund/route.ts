import { NextResponse } from "next/server";

import { refundOrderSchema } from "@/lib/orders-admin";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { refundOrder } from "@/server/services/order-admin";
import { orderGidFrom } from "@/server/shopify/order-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "orders:refund");
  await enforceRateLimit(`admin:order-money:${admin.userId}`, 60, 3600);
  const id = orderGidFrom(request);
  const input = await readJson(request, refundOrderSchema);
  const { order, refunded } = await refundOrder(id, input);
  await recordAudit({
    action: "order.refunded",
    actorId: admin.userId,
    targetType: "order",
    targetId: id,
    meta: { refunded },
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { order, refunded } });
});
