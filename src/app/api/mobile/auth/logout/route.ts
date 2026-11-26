import { NextResponse } from "next/server";
import { z } from "zod";

import { forbidden } from "@/server/http/errors";
import { isNativeClient, readJson, route } from "@/server/http/handler";
import { logoutSession } from "@/server/services/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ refreshToken: z.string().min(20).max(200) }).strict();

/** Ends this device's session. Idempotent: an unknown token is simply ignored. */
export const POST = route(async ({ request }) => {
  if (!isNativeClient(request)) throw forbidden("Not available", "native_client_required");
  const { refreshToken } = await readJson(request, bodySchema);
  await logoutSession(refreshToken);
  return new NextResponse(null, { status: 204 });
});
