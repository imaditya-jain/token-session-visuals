import { NextResponse } from "next/server";
import { z } from "zod";

import { forbidden } from "@/server/http/errors";
import { clientIp, isNativeClient, readJson, route, userAgent } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { refreshSession } from "@/server/services/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ refreshToken: z.string().min(20).max(200) }).strict();

/** Rotates the refresh token. Replaying an old token revokes the whole session family, exactly as on the website. */
export const POST = route(async ({ request }) => {
  if (!isNativeClient(request)) throw forbidden("Not available", "native_client_required");
  const ip = clientIp(request);
  await enforceRateLimit(`refresh:ip:${ip}`, 60, 60);
  const { refreshToken } = await readJson(request, bodySchema);
  const result = await refreshSession(refreshToken, { ip, userAgent: userAgent(request) });
  return NextResponse.json({
    data: {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      ...(result.refreshToken ? { refreshToken: result.refreshToken } : {}),
    },
  });
});
