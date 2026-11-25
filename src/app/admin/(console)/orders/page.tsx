import type { Metadata } from "next";

import RequirePermission from "@/components/admin/RequirePermission";
import OrdersPanel from "@/components/admin/orders/OrdersPanel";

export const metadata: Metadata = { title: "Orders" };

export default function Page() {
  return (
    <RequirePermission permission="orders:read">
      <OrdersPanel />
    </RequirePermission>
  );
}
