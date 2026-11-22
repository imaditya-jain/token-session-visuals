import type { Metadata } from "next";

import HeaderPanel from "@/components/admin/site/HeaderPanel";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Header & announcement" };

export default function Page() {
  return (
    <RequirePermission permission="site:write">
      <HeaderPanel />
    </RequirePermission>
  );
}
