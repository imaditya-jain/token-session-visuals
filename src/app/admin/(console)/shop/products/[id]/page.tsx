import type { Metadata } from "next";
import { notFound } from "next/navigation";

import RequirePermission from "@/components/admin/RequirePermission";
import ProductEditor from "@/components/admin/shop/ProductEditor";

export const metadata: Metadata = { title: "Edit product" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,20}$/.test(id)) notFound();
  return (
    <RequirePermission permission="products:read">
      <ProductEditor numeric={id} />
    </RequirePermission>
  );
}
