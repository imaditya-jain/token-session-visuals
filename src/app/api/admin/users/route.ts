import { NextResponse } from "next/server";

import { inviteAdminSchema } from "@/lib/admin-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { inviteAdmin, listAdminUsers } from "@/server/services/admin-users";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  await requireAdmin(request, "users:manage");
  return NextResponse.json({ data: { users: await listAdminUsers() } });
});

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "users:manage");
  await enforceRateLimit(`admin:invite:${admin.userId}`, 20, 3600);
  const input = await readJson(request, inviteAdminSchema);
  const user = await inviteAdmin(admin, input, clientIp(request));
  return NextResponse.json({ data: { user } }, { status: 201 });
});
