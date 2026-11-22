import type { Permission } from "@/lib/permissions";

/** Shapes the admin API returns, shared by the server services and the console. */
export type AdminUserView = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleKey: string;
  disabled: boolean;
  emailVerified: boolean;
  createdAt: string;
};

export type RoleView = {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  system: boolean;
  userCount: number;
};
