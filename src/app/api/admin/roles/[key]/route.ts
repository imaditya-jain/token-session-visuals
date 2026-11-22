import { NextResponse } from "next/server";

import { updateRoleSchema } from "@/lib/admin-schemas";
import { requireAdmin } from "@/server/auth/guards";
import { assertSameOrigin, clientIp, readJson, route } from "@/server/http/handler";
import { enforceRateLimit } from "@/server/ratelimit/enforce";
import { recordAudit } from "@/server/services/audit";
import { deleteRole, updateRole } from "@/server/services/rbac";

export const dynamic = "force-dynamic";

const keyOf = (pathname: string) => decodeURIComponent(pathname.split("/").pop() ?? "");

export const PATCH = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "roles:manage");
  await enforceRateLimit(`admin:role-write:${admin.userId}`, 60, 3600);
  const key = keyOf(request.nextUrl.pathname);
  const patch = await readJson(request, updateRoleSchema);
  await updateRole(admin.permissions, key, patch);
  await recordAudit({
    action: "role.updated",
    actorId: admin.userId,
    targetType: "role",
    targetId: key,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { updated: true } });
});

export const DELETE = route(async ({ request }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin(request, "roles:manage");
  await enforceRateLimit(`admin:role-write:${admin.userId}`, 60, 3600);
  const key = keyOf(request.nextUrl.pathname);
  await deleteRole(key);
  await recordAudit({
    action: "role.deleted",
    actorId: admin.userId,
    targetType: "role",
    targetId: key,
    ip: clientIp(request),
  });
  return NextResponse.json({ data: { deleted: true } });
});
