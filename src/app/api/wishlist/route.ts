import { NextResponse } from "next/server";

import { route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import { listWishlistHandles } from "@/server/services/wishlist";

export const dynamic = "force-dynamic";

/** The signed-in customer's saved product handles; the hearts on product cards read this. */
export const GET = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`wishlist:${userId}`, 120, 60);
  return NextResponse.json({ data: { handles: await listWishlistHandles(userId) } });
});
