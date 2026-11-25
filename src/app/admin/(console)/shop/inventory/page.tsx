import type { Metadata } from "next";

import RequirePermission from "@/components/admin/RequirePermission";
import InventoryPanel from "@/components/admin/shop/InventoryPanel";

export const metadata: Metadata = { title: "Inventory" };

export default function Page() {
  return (
    <RequirePermission permission="inventory:read">
      <InventoryPanel />
    </RequirePermission>
  );
}
