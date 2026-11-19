import { NextResponse } from "next/server";

import { addLineSchema, removeLineSchema, updateLineSchema } from "@/lib/cart";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { readCartCookie, setCartCookie } from "@/server/cart/token";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
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
  const { variantId, quantity } = await readJson(request, addLineSchema);
  return respond(await addLine(cartId, variantId, quantity), 201);
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
