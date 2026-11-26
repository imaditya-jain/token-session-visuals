import { NextResponse } from "next/server";

import { assertSameOrigin, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import { deleteCheck, getCheck } from "@/server/services/plant-doctor";

export const dynamic = "force-dynamic";

const idOf = (pathname: string) => pathname.split("/").pop() ?? "";

/** One past check, with live prices and stock for its suggested products. Someone else's id is a plain 404. */
export const GET = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`plant-doctor:read:${userId}`, 120, 60);
  const id = idOf(request.nextUrl.pathname);
  return NextResponse.json({ data: await getCheck(userId, id) });
});

/** Deletes a past check. Deleting one that is already gone is not an error. */
export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`plant-doctor:read:${userId}`, 120, 60);
  const id = idOf(request.nextUrl.pathname);
  await deleteCheck(userId, id);
  return new NextResponse(null, { status: 204 });
});
