import { NextResponse } from "next/server";
import { z } from "zod";

import { route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import { listOrders } from "@/server/services/orders";

export const dynamic = "force-dynamic";

const cursor = z.string().min(1).max(512).optional();
const querySchema = z.object({ after: cursor, before: cursor });

export const GET = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`orders:user:${userId}`, 60, 60);
  const { after, before } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ data: await listOrders(userId, { after, before }) });
});
