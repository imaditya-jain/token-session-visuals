import { NextResponse } from "next/server";

import { assertSameOrigin, clientIp, route } from "@/server/http/handler";
import { clearCartCookie, readCartCookie, setCartCookie } from "@/server/cart/token";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate, getProfile } from "@/server/services/auth";
import { setBuyerEmail } from "@/server/services/cart";

export const dynamic = "force-dynamic";

function respond(cart: Awaited<ReturnType<typeof setBuyerEmail>>, hadCookie: boolean) {
  const response = NextResponse.json({ data: { cart: cart.cart } });
  if (cart.cartId) setCartCookie(response, cart.cartId);
  else if (hadCookie) clearCartCookie(response);
  return response;
}

/**
 * Links the visitor's cart to their account. Needs the access token (the email comes from the account,
 * never from the request body) plus the signed cart cookie.
 */
export const PUT = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`cart:identity:${userId}`, 30, 60);
  const cartId = readCartCookie(request);
  const { email } = await getProfile(userId);
  return respond(await setBuyerEmail(cartId, email), request.cookies.has("fw_cart_hint"));
});

/** Unlinks the cart (used on sign-out so a shared computer doesn't keep the previous person's email). */
export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  await enforceRateLimit(`cart:identity:${clientIp(request)}`, 30, 60);
  const cartId = readCartCookie(request);
  return respond(await setBuyerEmail(cartId, null), request.cookies.has("fw_cart_hint"));
});
