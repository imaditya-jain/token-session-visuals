import type { Metadata } from "next";

import EnquiriesPanel from "@/components/admin/enquiries/EnquiriesPanel";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Wholesale applications" };

export default function Page() {
  return (
    <RequirePermission permission="enquiries:read">
      <EnquiriesPanel kind="wholesale" />
    </RequirePermission>
  );
}
