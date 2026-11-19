import { NextResponse } from "next/server";

import { profileSchema } from "@/lib/auth-schemas";
import { readJson, route } from "@/server/http/handler";
import { authenticate, getProfile, updateProfile } from "@/server/services/auth";

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
