import type { Metadata } from "next";

import CampaignsPanel from "@/components/admin/campaigns/CampaignsPanel";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Campaigns" };

export default function Page() {
  return (
    <RequirePermission permission="campaigns:read">
      <CampaignsPanel />
    </RequirePermission>
  );
}
