import type { Metadata } from "next";

import SocialPanel from "@/components/admin/site/SocialPanel";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Social links" };

export default function Page() {
  return (
    <RequirePermission permission="site:write">
      <SocialPanel />
    </RequirePermission>
  );
}
