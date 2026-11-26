import { NextResponse } from "next/server";

import { addLineSchema, removeLineSchema, updateLineSchema } from "@/lib/cart-schemas";
import { bookingAttributes } from "@/lib/gardener-schemas";
import { giftAttributes } from "@/lib/gift-schemas";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { readCartCookie, setCartCookie } from "@/server/cart/token";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { assertBouquetHasDelivery } from "@/server/services/gifts";
import { ensureBookingCustomer } from "@/server/services/booking-customer";
import { toE164 } from "@/server/services/customer-sync";
import { addLine, removeLine, updateLine, type CartResult } from "@/server/services/cart";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

async function guard(request: NextRequest): Promise<string | null> {
  assertSameOrigin(request);
  await enforceRateLimit(`cart:write:${clientIp(request)}`, 60, 60);
  return readCartCookie(request);
}

function respond({ cart, cartId }: CartResult, status = 200): NextResponse {
  const response = NextResponse.json({ data: { cart } }, { status });
  if (cartId) setCartCookie(response, cartId);
  return response;
}

export const POST = route(async ({ request }) => {
  const cartId = await guard(request);
  const { variantId, quantity, sellingPlanId, booking, gift } = await readJson(
    request,
    addLineSchema,
  );
  await assertBouquetHasDelivery(variantId, gift);
  if (booking) await ensureBookingCustomer(booking);
  return respond(
    await addLine(cartId, variantId, quantity, {
      sellingPlanId,
      attributes: booking ? bookingAttributes(booking) : gift ? giftAttributes(gift) : undefined,
      buyer: booking ? { email: booking.email, phone: toE164(booking.phone) } : undefined,
    }),
    201,
  );
});

export const PATCH = route(async ({ request }) => {
  const cartId = await guard(request);
  const { lineId, quantity } = await readJson(request, updateLineSchema);
  return respond(await updateLine(cartId, lineId, quantity));
});

export const DELETE = route(async ({ request }) => {
  const cartId = await guard(request);
  const { lineId } = await readJson(request, removeLineSchema);
  return respond(await removeLine(cartId, lineId));
});
