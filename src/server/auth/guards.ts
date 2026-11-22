import "server-only";

import type { NextRequest } from "next/server";

import type { Permission } from "@/lib/permissions";
import { forbidden } from "@/server/http/errors";
import { authenticate } from "@/server/services/auth";
import { resolvePermissions } from "@/server/services/rbac";

export type AdminContext = {
  userId: string;
  sid: string;
  adminRole: string;
  permissions: ReadonlySet<Permission>;
};

/**
 * Authorization gate for every admin API. Verifies the Bearer token and its live session, then loads the
 * caller's role and permissions FROM THE DATABASE (never the token), so a demotion or a disabled account
 * takes effect on the next request. Pass `permission` to require a capability; omit it for "any admin".
 */
export async function requireAdmin(
  request: NextRequest,
  permission?: Permission,
): Promise<AdminContext> {
  const { userId, sid, adminRole } = await authenticate(request.headers.get("authorization"));
  if (!adminRole) throw forbidden("Admin access required.", "admin_required");
  const permissions = await resolvePermissions(adminRole);
  if (permission && !permissions.has(permission)) {
    throw forbidden("You don't have permission to do that.", "permission_denied");
  }
  return { userId, sid, adminRole, permissions };
}
