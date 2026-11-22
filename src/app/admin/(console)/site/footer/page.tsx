import type { Metadata } from "next";

import FooterPanel from "@/components/admin/site/FooterPanel";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Footer" };

export default function Page() {
  return (
    <RequirePermission permission="site:write">
      <FooterPanel />
    </RequirePermission>
  );
}
