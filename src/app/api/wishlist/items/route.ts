import { NextResponse } from "next/server";
import { z } from "zod";

import { assertSameOrigin, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import { addToWishlist, HANDLE_PATTERN, removeFromWishlist } from "@/server/services/wishlist";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ handle: z.string().max(120).regex(HANDLE_PATTERN) }).strict();

/** Saves a product. Idempotent. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`wishlist:${userId}`, 120, 60);
  const { handle } = await readJson(request, bodySchema);
  return NextResponse.json({ data: { handles: await addToWishlist(userId, handle) } });
});

/** Removes a product. Removing one that isn't saved is not an error. */
export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`wishlist:${userId}`, 120, 60);
  const { handle } = await readJson(request, bodySchema);
  return NextResponse.json({ data: { handles: await removeFromWishlist(userId, handle) } });
});
