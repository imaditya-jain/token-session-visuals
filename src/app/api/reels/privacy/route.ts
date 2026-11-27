import { NextResponse } from "next/server";

import { privacySchema } from "@/lib/reels";
import { assertSameOrigin, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate } from "@/server/services/auth";
import { ensureProfile, setPrivacy } from "@/server/services/reel-social";

export const dynamic = "force-dynamic";

/** The caller's own privacy setting and public handle. */
export const GET = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`follow-read:${userId}`, 120, 60);
  const profile = await ensureProfile(userId);
  return NextResponse.json({ data: { key: profile.publicId, isPrivate: profile.isPrivate } });
});

/** Public (anyone can watch) or private (only accepted followers). Going public accepts pending requests. */
export const PUT = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`follow:${userId}`, 60, 3600);
  const { isPrivate } = await readJson(request, privacySchema);
  return NextResponse.json({ data: await setPrivacy(userId, isPrivate) });
});
