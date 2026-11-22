import { hasPermission, type Permission } from "@/lib/permissions";

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
  /** Absent = every admin. */
  permission?: Permission;
};

export type AdminNavGroup = {
  id: string;
  /** Heading shown above the group; absent for the top-level entry. */
  label: string | null;
  items: readonly AdminNavItem[];
};

/**
 * Every page of the admin console, grouped under its main menu. A section appears here only once its page exists.
 * Groups with nothing the person may open are hidden entirely.
 */
export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    id: "overview",
    label: null,
    items: [{ href: "/admin", label: "Dashboard", description: "Your access and recent activity" }],
  },
  {
    id: "website",
    label: "Website",
    items: [
      {
        href: "/admin/site/header",
        label: "Header & announcement",
        description: "The menu and the announcement bar on every page",
        permission: "site:write",
      },
      {
        href: "/admin/site/footer",
        label: "Footer",
        description: "Footer links, contact details and the newsletter block",
        permission: "site:write",
      },
      {
        href: "/admin/site/social",
        label: "Social links",
        description: "The social icons in the footer",
        permission: "site:write",
      },
    ],
  },
  {
    id: "enquiries",
    label: "Enquiries",
    items: [
      {
        href: "/admin/enquiries/contact",
        label: "Contact messages",
        description: "Messages from the website's contact form",
        permission: "enquiries:read",
      },
      {
        href: "/admin/enquiries/wholesale",
        label: "Wholesale applications",
        description: "Trade applications: review, assign and approve",
        permission: "enquiries:read",
      },
    ],
  },
  {
    id: "blog",
    label: "Blog",
    items: [
      {
        href: "/admin/posts",
        label: "Posts",
        description: "Write, schedule and publish journal posts",
        permission: "blog:read",
      },
      {
        href: "/admin/categories",
        label: "Categories & tags",
        description: "Organise posts into categories and tags",
        permission: "categories:manage",
      },
      {
        href: "/admin/media",
        label: "Media",
        description: "The image library for your posts",
        permission: "media:manage",
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    items: [
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
    ],
  },
];

/** Flat list of all entries (the dashboard's "where to go" cards use it). */
export const ADMIN_NAV: readonly AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

const allowed = (item: AdminNavItem, granted: ReadonlySet<Permission>): boolean =>
  !item.permission || hasPermission(granted, item.permission);

/** Entries the given permissions allow. Hiding is a convenience; the API is the boundary. */
export function visibleNav(permissions: readonly Permission[]): AdminNavItem[] {
  const granted = new Set(permissions);
  return ADMIN_NAV.filter((item) => allowed(item, granted));
}

/** The sidebar: groups with only the entries the person may open; empty groups disappear. */
export function visibleNavGroups(permissions: readonly Permission[]): AdminNavGroup[] {
  const granted = new Set(permissions);
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed(item, granted)),
  })).filter((group) => group.items.length > 0);
}

export function isActiveNav(pathname: string, href: string): boolean {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);
}
