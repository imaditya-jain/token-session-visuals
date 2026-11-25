import type { Metadata } from "next";
import { notFound } from "next/navigation";

import RequirePermission from "@/components/admin/RequirePermission";
import OrderDetail from "@/components/admin/orders/OrderDetail";

export const metadata: Metadata = { title: "Order" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,20}$/.test(id)) notFound();
  return (
    <RequirePermission permission="orders:read">
      <OrderDetail numeric={id} />
    </RequirePermission>
  );
}
