import type { Metadata } from "next";

import RequirePermission from "@/components/admin/RequirePermission";
import RolesPanel from "@/components/admin/RolesPanel";

export const metadata: Metadata = { title: "Roles" };

export default function RolesPage() {
  return (
    <RequirePermission permission="roles:manage">
      <RolesPanel />
    </RequirePermission>
  );
}
