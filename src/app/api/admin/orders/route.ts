import { NextResponse } from "next/server";

import { orderListQuerySchema } from "@/lib/orders-admin";
import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { fetchOrders } from "@/server/services/order-admin";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "orders:read");
  const query = orderListQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ data: await fetchOrders(query) });
});
