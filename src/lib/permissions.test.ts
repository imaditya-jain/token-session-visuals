import { describe, expect, it } from "vitest";

import { isSystemRole, PERMISSION_KEYS, roleKeySchema, SYSTEM_ROLES } from "./permissions";

describe("permissions", () => {
  it("super admin holds every permission, editor a strict subset without user/role/audit control", () => {
    expect(new Set(SYSTEM_ROLES.super_admin.permissions)).toEqual(new Set(PERMISSION_KEYS));
    const editor = new Set<string>(SYSTEM_ROLES.editor.permissions);
    for (const sensitive of ["users:manage", "roles:manage", "audit:read", "blog:delete"]) {
      expect(editor.has(sensitive)).toBe(false);
    }
    expect(editor.has("blog:publish")).toBe(true);
  });

  it("only recognises built-in role keys as system roles (no prototype keys)", () => {
    expect(isSystemRole("editor")).toBe(true);
    expect(isSystemRole("toString")).toBe(false);
    expect(isSystemRole("__proto__")).toBe(false);
  });

  it("restricts custom role keys to a safe slug", () => {
    expect(roleKeySchema.safeParse("seo_manager").success).toBe(true);
    for (const bad of ["Admin", "a", "1abc", "has space", "x".repeat(41), "../etc"]) {
      expect(roleKeySchema.safeParse(bad).success).toBe(false);
    }
  });
});
