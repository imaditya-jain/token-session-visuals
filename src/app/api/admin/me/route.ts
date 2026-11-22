import { NextResponse } from "next/server";

import { requireAdmin } from "@/server/auth/guards";
import { route } from "@/server/http/handler";
import { getProfile } from "@/server/services/auth";

export const dynamic = "force-dynamic";

/** Who am I, which role, and what may I do. The UI uses `permissions` only to shape navigation. */
export const GET = route(async ({ request }) => {
  const admin = await requireAdmin(request);
  const user = await getProfile(admin.userId);
  return NextResponse.json({
    data: { user, roleKey: admin.adminRole, permissions: [...admin.permissions] },
  });
});
