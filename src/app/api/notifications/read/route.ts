import { NextResponse } from "next/server";
import { z } from "zod";

import { assertSameOrigin, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import { markNotificationsRead } from "@/server/services/notifications";

export const dynamic = "force-dynamic";

const bodySchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({
    ids: z
      .array(z.string().regex(/^[a-f\d]{24}$/i))
      .min(1)
      .max(50),
  }),
]);

/** Marks notifications read. Only ever touches the caller's own; unknown or foreign ids are simply ignored. */
export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`notifications:${userId}`, 120, 60);
  const body = await readJson(request, bodySchema);
  const updated = await markNotificationsRead(userId, "all" in body ? "all" : body.ids);
  return NextResponse.json({ data: { updated } });
});
