import type { Metadata } from "next";

import RequirePermission from "@/components/admin/RequirePermission";
import PagesPanel from "@/components/admin/pages/PagesPanel";

export const metadata: Metadata = { title: "Page content" };

export default function Page() {
  return (
    <RequirePermission permission="site:write">
      <PagesPanel />
    </RequirePermission>
  );
}
