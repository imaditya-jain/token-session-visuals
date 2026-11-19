import { NextResponse } from "next/server";

import { clientIp, route } from "@/server/http/handler";
import { clearCartCookie, readCartCookie, setCartCookie } from "@/server/cart/token";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { getCart } from "@/server/services/cart";

export const dynamic = "force-dynamic";

/** Guest cart: authorised by the signed, httpOnly cart cookie bound to one Shopify cart (CLAUDE.md §7). */
export const GET = route(async ({ request }) => {
  await enforceRateLimit(`cart:read:${clientIp(request)}`, 120, 60);
  const { cart, cartId } = await getCart(readCartCookie(request));
  const response = NextResponse.json({ data: { cart } });
  if (cartId) setCartCookie(response, cartId);
  else if (request.cookies.has("fw_cart_hint")) clearCartCookie(response);
  return response;
});
