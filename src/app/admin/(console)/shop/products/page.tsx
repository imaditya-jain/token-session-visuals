import type { Metadata } from "next";

import RequirePermission from "@/components/admin/RequirePermission";
import ProductsPanel from "@/components/admin/shop/ProductsPanel";

export const metadata: Metadata = { title: "Products" };

export default function Page() {
  return (
    <RequirePermission permission="products:read">
      <ProductsPanel />
    </RequirePermission>
  );
}
