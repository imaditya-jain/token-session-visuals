import "server-only";

import type { RoleView } from "@/lib/admin-types";
import {
  isSystemRole,
  PERMISSION_KEYS,
  type Permission,
  SYSTEM_ROLES,
  type SystemRoleKey,
} from "@/lib/permissions";
import { connectDb } from "@/server/db/connection";
import { Role } from "@/server/db/models/role";
import { User } from "@/server/db/models/user";
import { badRequest, conflict, forbidden } from "@/server/http/errors";

export type { RoleView };

const known = new Set<string>(PERMISSION_KEYS);
const onlyKnown = (values: readonly string[]): Permission[] =>
  values.filter((value): value is Permission => known.has(value));

/** Permissions of a role key. Unknown or deleted roles grant nothing (fail closed). */
export async function resolvePermissions(roleKey: string): Promise<ReadonlySet<Permission>> {
  if (isSystemRole(roleKey)) return new Set(SYSTEM_ROLES[roleKey].permissions);
  await connectDb();
  const role = await Role.findOne({ key: roleKey }).lean();
  return new Set(role ? onlyKnown(role.permissions) : []);
}

/**
 * Nobody can hand out access they don't hold: an Editor with `roles:manage` still can't mint a role that
 * contains `users:manage`. Prevents privilege escalation through role editing.
 */
export function assertCanGrant(
  actor: ReadonlySet<Permission>,
  granted: readonly Permission[],
): void {
  const missing = granted.filter((permission) => !actor.has(permission));
  if (missing.length > 0) {
    throw forbidden("You can't grant permissions you don't have.", "privilege_escalation");
  }
}

export async function listRoles(): Promise<RoleView[]> {
  await connectDb();
  const [custom, counts] = await Promise.all([
    Role.find({}).sort({ name: 1 }).lean(),
    User.aggregate<{ _id: string; count: number }>([
      { $match: { adminRole: { $exists: true } } },
      { $group: { _id: "$adminRole", count: { $sum: 1 } } },
    ]),
  ]);
  const countOf = (key: string) => counts.find((row) => row._id === key)?.count ?? 0;

  const system = (Object.keys(SYSTEM_ROLES) as SystemRoleKey[]).map((key) => ({
    key,
    name: SYSTEM_ROLES[key].name,
    description: SYSTEM_ROLES[key].description,
    permissions: [...SYSTEM_ROLES[key].permissions],
    system: true,
    userCount: countOf(key),
  }));
  return [
    ...system,
    ...custom.map((role) => ({
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: onlyKnown(role.permissions),
      system: false,
      userCount: countOf(role.key),
    })),
  ];
}

export async function roleExists(key: string): Promise<boolean> {
  if (isSystemRole(key)) return true;
  await connectDb();
  return Boolean(await Role.exists({ key }));
}

export async function createRole(
  actor: ReadonlySet<Permission>,
  input: { key: string; name: string; description: string; permissions: Permission[] },
): Promise<RoleView> {
  if (isSystemRole(input.key)) throw conflict("That role key is reserved.", "role_key_reserved");
  assertCanGrant(actor, input.permissions);
  await connectDb();
  try {
    const role = await Role.create({ ...input, permissions: [...new Set(input.permissions)] });
    return {
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: onlyKnown(role.permissions),
      system: false,
      userCount: 0,
    };
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      throw conflict("A role with this key already exists.", "role_key_taken");
    throw error;
  }
}

export async function updateRole(
  actor: ReadonlySet<Permission>,
  key: string,
  patch: {
    name?: string | undefined;
    description?: string | undefined;
    permissions?: Permission[] | undefined;
  },
): Promise<void> {
  if (isSystemRole(key)) throw forbidden("Built-in roles can't be edited.", "system_role");
  if (patch.permissions) assertCanGrant(actor, patch.permissions);
  await connectDb();
  const update = {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.permissions ? { permissions: [...new Set(patch.permissions)] } : {}),
  };
  const result = await Role.updateOne({ key }, { $set: update });
  if (result.matchedCount === 0) throw badRequest("Role not found.", "role_not_found");
}

export async function deleteRole(key: string): Promise<void> {
  if (isSystemRole(key)) throw forbidden("Built-in roles can't be deleted.", "system_role");
  await connectDb();
  if (await User.exists({ adminRole: key })) {
    throw conflict("Reassign the users who hold this role first.", "role_in_use");
  }
  const result = await Role.deleteOne({ key });
  if (result.deletedCount === 0) throw badRequest("Role not found.", "role_not_found");
}
