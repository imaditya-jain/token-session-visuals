import { hasPermission, type Permission } from "@/lib/permissions";

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  /** Absent = every admin. */
  permission?: Permission;
};

/** Every page of the admin console. A section appears here only once its page exists. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", description: "Your access and recent activity" },
  {
    href: "/admin/users",
    label: "Team",
    description: "Invite admins, change roles, disable accounts",
    permission: "users:manage",
  },
  {
    href: "/admin/roles",
    label: "Roles",
    description: "Decide what each role may do",
    permission: "roles:manage",
  },
  {
    href: "/admin/activity",
    label: "Activity",
    description: "Who did what, and when",
    permission: "audit:read",
  },
];

/** Navigation entries the given permissions allow. Hiding is a convenience; the API is the boundary. */
export function visibleNav(permissions: readonly Permission[]): AdminNavItem[] {
  const granted = new Set(permissions);
  return ADMIN_NAV.filter((item) => !item.permission || hasPermission(granted, item.permission));
}

export function isActiveNav(pathname: string, href: string): boolean {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);
}
