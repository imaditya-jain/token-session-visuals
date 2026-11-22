"use client";

import type { ReactNode } from "react";

import type { Permission } from "@/lib/permissions";
import { useAppSelector } from "@/store/hooks";

import PageHeader from "./PageHeader";

/** Shows a page only to roles that hold the permission (the API refuses everyone else regardless). */
export default function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const permissions = useAppSelector((state) => state.admin.access?.permissions ?? []);
  if (permissions.includes(permission)) return <>{children}</>;
  return (
    <PageHeader
      title="You don't have access to this page"
      lead="Ask a Super Admin if you need it."
    />
  );
}
