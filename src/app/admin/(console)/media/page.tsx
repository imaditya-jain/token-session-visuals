import type { Metadata } from "next";

import MediaPanel from "@/components/admin/media/MediaPanel";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Media" };

export default function MediaPage() {
  return (
    <RequirePermission permission="media:manage">
      <MediaPanel />
    </RequirePermission>
  );
}
