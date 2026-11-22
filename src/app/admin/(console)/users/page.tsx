import type { Metadata } from "next";

import RequirePermission from "@/components/admin/RequirePermission";
import UsersPanel from "@/components/admin/UsersPanel";

export const metadata: Metadata = { title: "Team" };

export default function UsersPage() {
  return (
    <RequirePermission permission="users:manage">
      <UsersPanel />
    </RequirePermission>
  );
}
