import { NextResponse } from "next/server";

import { createRoleSchema } from "@/lib/admin-schemas";
import { PERMISSIONS } from "@/lib/permissions";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { createRole, listRoles } from "@/server/services/rbac";

export const dynamic = "force-dynamic";

export const GET = route(async ({ request }) => {
  const admin = await requireAdmin(request);
  if (!admin.permissions.has("roles:manage") && !admin.permissions.has("users:manage")) {
    return NextResponse.json(
      { error: { code: "permission_denied", message: "You don't have permission to do that." } },
      { status: 403 },
    );
  }
  return NextResponse.json({ data: { roles: await listRoles(), permissions: PERMISSIONS } });
});

export const POST = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "roles:manage");
  await enforceRateLimit(`admin:role-write:${admin.userId}`, 60, 3600);
  const input = await readJson(request, createRoleSchema);
  const role = await createRole(admin.permissions, input);
  await recordAudit({
    action: "role.created",
    actorId: admin.userId,
    targetType: "role",
    targetId: role.key,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { role } }, { status: 201 });
});
