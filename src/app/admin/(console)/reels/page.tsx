import type { Metadata } from "next";

import ReelsPanel from "@/components/admin/reels/ReelsPanel";
import RequirePermission from "@/components/admin/RequirePermission";

export const metadata: Metadata = { title: "Reels" };

export default function Page() {
  return (
    <RequirePermission permission="reels:moderate">
      <ReelsPanel />
    </RequirePermission>
  );
}
