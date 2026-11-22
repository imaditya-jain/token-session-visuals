import { z } from "zod";

/**
 * Every capability the admin API can check. Routes enforce these on the server; the admin UI only uses
 * them to hide navigation, never as a security boundary.
 */
export const PERMISSIONS = {
  "dashboard:view": "View the dashboard",
  "blog:read": "View blog posts",
  "blog:write": "Create and edit blog posts",
  "blog:publish": "Publish, schedule and unpublish blog posts",
  "blog:delete": "Move blog posts to trash and delete them permanently",
  "categories:manage": "Manage blog categories and tags",
  "media:manage": "Upload and manage media",
  "enquiries:read": "View contact messages and wholesale applications",
  "enquiries:write": "Change status, assign, add notes to and archive enquiries",
  "enquiries:delete": "Permanently delete archived enquiries",
  "enquiries:export": "Export enquiries to CSV",
  "site:write": "Edit the header, footer, social links and website pages (drafts)",
  "site:publish": "Publish changes to the header, footer, social links and website pages",
  "users:manage": "Invite, change and disable admin users",
  "roles:manage": "Create and edit roles",
  "audit:read": "View the audit log",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as [Permission, ...Permission[]];

export const permissionSchema = z.enum(PERMISSION_KEYS);

/**
 * Roles shipped with the product. They live in code so they cannot be edited or deleted through the API
 * (a compromised editor can never widen its own role). Custom roles are stored in the database.
 */
export const SYSTEM_ROLES = {
  super_admin: {
    name: "Super Admin",
    description: "Full access to every module, including users and roles.",
    permissions: PERMISSION_KEYS,
  },
  editor: {
    name: "Editor",
    description: "Writes and publishes blog content and manages its categories and media.",
    permissions: [
      "dashboard:view",
      "blog:read",
      "blog:write",
      "blog:publish",
      "categories:manage",
      "media:manage",
    ],
  },
} as const satisfies Record<
  string,
  { name: string; description: string; permissions: readonly Permission[] }
>;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;

export const isSystemRole = (key: string): key is SystemRoleKey =>
  Object.prototype.hasOwnProperty.call(SYSTEM_ROLES, key);

export const roleKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,39}$/, "Use lowercase letters, digits and underscores");

export const hasPermission = (granted: ReadonlySet<Permission>, needed: Permission): boolean =>
  granted.has(needed);
