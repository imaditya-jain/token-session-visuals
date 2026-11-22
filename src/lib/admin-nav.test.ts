import { describe, expect, it } from "vitest";

import { isActiveNav, visibleNav } from "./admin-nav";
import { SYSTEM_ROLES } from "./permissions";

describe("admin navigation", () => {
  it("shows an editor only the sections their permissions allow", () => {
    const labels = visibleNav(SYSTEM_ROLES.editor.permissions).map((item) => item.label);
    expect(labels).toEqual(["Dashboard"]);
  });

  it("shows a super admin everything", () => {
    expect(visibleNav(SYSTEM_ROLES.super_admin.permissions).map((item) => item.label)).toEqual([
      "Dashboard",
      "Team",
      "Roles",
      "Activity",
    ]);
  });

  it("shows only the dashboard to a role with no permissions", () => {
    expect(visibleNav([]).map((item) => item.label)).toEqual(["Dashboard"]);
  });

  it("marks the dashboard active only on its own path, other sections by prefix", () => {
    expect(isActiveNav("/admin", "/admin")).toBe(true);
    expect(isActiveNav("/admin/users", "/admin")).toBe(false);
    expect(isActiveNav("/admin/users", "/admin/users")).toBe(true);
    expect(isActiveNav("/admin/users/123", "/admin/users")).toBe(true);
    expect(isActiveNav("/admin/usersx", "/admin/users")).toBe(false);
  });
});
