import { NextResponse } from "next/server";

import { deleteAccountSchema, profileSchema } from "@/lib/auth-schemas";
import { clearRefreshCookie } from "@/server/auth/cookies";
import { assertSameOrigin, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { authenticate, getProfile, updateProfile } from "@/server/services/auth";
import { deleteAccount } from "@/server/services/privacy";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  return NextResponse.json({ data: { user: await getProfile(userId) } });
});

export const PATCH = route(async ({ request }) => {
  const { userId } = await authenticate(request.headers.get("authorization"));
  const patch = await readJson(request, profileSchema);
  return NextResponse.json({ data: { user: await updateProfile(userId, patch) } });
});

/** Permanent account deletion. Needs a valid session AND the password again; limited to 5 attempts an hour. */
export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const { userId } = await authenticate(request.headers.get("authorization"));
  await enforceRateLimit(`account:delete:${userId}`, 5, 3600);
  const { password } = await readJson(request, deleteAccountSchema);
  await deleteAccount(userId, password);
  const response = NextResponse.json({ data: { deleted: true } });
  clearRefreshCookie(response);
  return response;
});
