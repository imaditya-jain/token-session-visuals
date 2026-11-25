import { describe, expect, it } from "vitest";

import { isActiveNav, visibleNav, visibleNavGroups } from "./admin-nav";
import { SYSTEM_ROLES } from "./permissions";

describe("admin navigation groups", () => {
  const shape = (permissions: Parameters<typeof visibleNavGroups>[0]) =>
    visibleNavGroups(permissions).map((group) => [group.label, group.items.map((i) => i.label)]);

  it("groups a super admin's menu under Blog and Administration below the dashboard", () => {
    expect(shape(SYSTEM_ROLES.super_admin.permissions)).toEqual([
      [null, ["Dashboard"]],
      ["Website", ["Page content", "Header & announcement", "Footer", "Social links"]],
      ["Enquiries", ["Contact messages", "Wholesale applications"]],
      ["Sales", ["Orders", "Subscriptions"]],
      ["Shop", ["Products", "Inventory"]],
      ["Marketing", ["Campaigns"]],
      ["Blog", ["Posts", "Categories & tags", "Media"]],
      ["Administration", ["Team", "Roles", "Activity"]],
    ]);
  });

  it("hides whole groups the person has nothing in, and single entries they can't open", () => {
    expect(shape(SYSTEM_ROLES.editor.permissions)).toEqual([
      [null, ["Dashboard"]],
      ["Blog", ["Posts", "Categories & tags", "Media"]],
    ]);
    expect(shape(["blog:read"])).toEqual([
      [null, ["Dashboard"]],
      ["Blog", ["Posts"]],
    ]);
    expect(shape(["users:manage"])).toEqual([
      [null, ["Dashboard"]],
      ["Administration", ["Team"]],
    ]);
    expect(shape([])).toEqual([[null, ["Dashboard"]]]);
  });

  it("never lists the same page twice", () => {
    const hrefs = visibleNavGroups(SYSTEM_ROLES.super_admin.permissions).flatMap((g) =>
      g.items.map((i) => i.href),
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("admin navigation", () => {
  it("shows an editor the content sections but not team, roles or activity", () => {
    const labels = visibleNav(SYSTEM_ROLES.editor.permissions).map((item) => item.label);
    expect(labels).toEqual(["Dashboard", "Posts", "Categories & tags", "Media"]);
  });

  it("shows a super admin everything", () => {
    expect(visibleNav(SYSTEM_ROLES.super_admin.permissions).map((item) => item.label)).toEqual([
      "Dashboard",
      "Page content",
      "Header & announcement",
      "Footer",
      "Social links",
      "Contact messages",
      "Wholesale applications",
      "Orders",
      "Subscriptions",
      "Products",
      "Inventory",
      "Campaigns",
      "Posts",
      "Categories & tags",
      "Media",
      "Team",
      "Roles",
      "Activity",
    ]);
  });

  it("shows only the dashboard to a role with no permissions", () => {
    expect(visibleNav([]).map((item) => item.label)).toEqual(["Dashboard"]);
  });

  it("shows a writer-only role just the dashboard and posts", () => {
    expect(visibleNav(["blog:read", "blog:write"]).map((item) => item.label)).toEqual([
      "Dashboard",
      "Posts",
    ]);
  });

  it("marks the dashboard active only on its own path, other sections by prefix", () => {
    expect(isActiveNav("/admin", "/admin")).toBe(true);
    expect(isActiveNav("/admin/users", "/admin")).toBe(false);
    expect(isActiveNav("/admin/users", "/admin/users")).toBe(true);
    expect(isActiveNav("/admin/users/123", "/admin/users")).toBe(true);
    expect(isActiveNav("/admin/usersx", "/admin/users")).toBe(false);
  });
});
