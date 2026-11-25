import { NextResponse } from "next/server";

import { orderListQuerySchema } from "@/lib/orders-admin";
import { requireAdmin } from "@/server/auth/guards";
import { clientIp, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { exportOrders } from "@/server/services/order-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** CSV of the filtered orders (up to 5,000). Customer names are personal data, so it has its own permission and is audited. */
export const GET = route(async ({ request }) => {
  const admin = await requireAdmin(request, "orders:export");
  await enforceRateLimit(`admin:order-export:${admin.userId}`, 10, 3600);
  const query = orderListQuerySchema
    .omit({ after: true })
    .parse(Object.fromEntries(request.nextUrl.searchParams));
  const { csv, rows, truncated } = await exportOrders(query);
  await recordAudit({
    action: "order.exported",
    actorId: admin.userId,
    targetType: "order",
    meta: { rows, truncated },
    ip: clientIp(request),
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fernwood-orders-${stamp}.csv"`,
      ...(truncated ? { "X-Export-Truncated": "true" } : {}),
    },
  });
});
