import { NextResponse } from "next/server";

import { route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import { listWishlistProducts } from "@/server/services/wishlist";

export const dynamic = "force-dynamic";

/** The saved products with live price and stock, for the wishlist page. Only the caller's own list is ever read. */
export const GET = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`wishlist:${userId}`, 120, 60);
  return NextResponse.json({ data: { products: await listWishlistProducts(userId) } });
});
