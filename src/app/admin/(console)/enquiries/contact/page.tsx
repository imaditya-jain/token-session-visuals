import type { Metadata } from "next";

import EnquiriesPanel from "@/components/admin/enquiries/EnquiriesPanel";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Contact messages" };

export default function Page() {
  return (
    <RequirePermission permission="enquiries:read">
      <EnquiriesPanel kind="contact" />
    </RequirePermission>
  );
}
