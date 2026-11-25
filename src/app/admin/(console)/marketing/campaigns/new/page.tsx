import type { Metadata } from "next";

import CampaignEditor from "@/components/admin/campaigns/CampaignEditor";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "New campaign" };

export default function Page() {
  return (
    <RequirePermission permission="campaigns:write">
      <CampaignEditor />
    </RequirePermission>
  );
}
