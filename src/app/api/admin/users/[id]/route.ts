import { NextResponse } from "next/server";

import { updateAdminUserSchema } from "@/lib/admin-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { updateAdminUser } from "@/server/services/admin-users";

export const dynamic = "force-dynamic";

export const PATCH = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "users:manage");
  await enforceRateLimit(`admin:user-update:${admin.userId}`, 60, 3600);
  const id = request.nextUrl.pathname.split("/").pop() ?? "";
  const patch = await readJson(request, updateAdminUserSchema);
  await updateAdminUser(admin, id, patch, clientIp(request));
  return NextResponse.json({ data: { updated: true } });
});
