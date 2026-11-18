import { NextResponse } from "next/server";

import { AppError } from "@/server/http/errors";
import { route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import { getOrder } from "@/server/services/orders";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`orders:user:${userId}`, 60, 60);
  const id = request.nextUrl.pathname.split("/").pop() ?? "";
  const order = await getOrder(userId, id);
  if (!order) throw new AppError(404, "not_found", "Order not found");
  return NextResponse.json({ data: { order } });
});
