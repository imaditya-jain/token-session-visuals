import { NextResponse } from "next/server";

import { route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import { exportAccountData } from "@/server/services/privacy";

export const dynamic = "force-dynamic";

/** The signed-in person's own data as a downloadable JSON file. Scoped by the token's user id, never a parameter. */
export const GET = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`account:export:${userId}`, 5, 3600);
  const data = await exportAccountData(userId);
  return NextResponse.json(
    { data },
    { headers: { "Content-Disposition": 'attachment; filename="fernwood-my-data.json"' } },
  );
});
