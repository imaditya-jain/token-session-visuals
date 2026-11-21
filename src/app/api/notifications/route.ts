import { NextResponse } from "next/server";
import { z } from "zod";

import { route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import { listNotifications } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

const query = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });

/** The signed-in customer's notifications, newest first, with the unread count. Polled by the account page. */
export const GET = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`notifications:${userId}`, 120, 60);
  const { limit } = query.parse(Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json({ data: await listNotifications(userId, limit) });
});
