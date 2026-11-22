import type { Metadata } from "next";

import MediaPanel from "@/components/admin/blog/MediaPanel";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Media" };

export default function MediaPage() {
  return (
    <RequirePermission permission="media:manage">
      <MediaPanel />
    </RequirePermission>
  );
}
