import type { Metadata } from "next";

import RequirePermission from "@/components/admin/RequirePermission";
import ProductEditor from "@/components/admin/shop/ProductEditor";

export const metadata: Metadata = { title: "New product" };

export default function Page() {
  return (
    <RequirePermission permission="products:write">
      <ProductEditor />
    </RequirePermission>
  );
}
