import type { Metadata } from "next";

import RequirePermission from "@/components/admin/RequirePermission";
import SubscriptionsPanel from "@/components/admin/subscriptions/SubscriptionsPanel";

export const metadata: Metadata = { title: "Subscriptions" };

export default function Page() {
  return (
    <RequirePermission permission="subscriptions:read">
      <SubscriptionsPanel />
    </RequirePermission>
  );
}
