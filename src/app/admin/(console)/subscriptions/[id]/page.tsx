import type { Metadata } from "next";
import { notFound } from "next/navigation";

import RequirePermission from "@/components/admin/RequirePermission";
import SubscriptionDetailView from "@/components/admin/subscriptions/SubscriptionDetailView";

export const metadata: Metadata = { title: "Subscription" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,20}$/.test(id)) notFound();
  return (
    <RequirePermission permission="subscriptions:read">
      <SubscriptionDetailView id={id} />
    </RequirePermission>
  );
}
