import type { Metadata } from "next";

import AccountNav from "@/components/account/AccountNav";
import OrderDetailPanel from "@/components/account/OrderDetailPanel";
import AuthShell from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "Order — Fernwood",
  robots: { index: false, follow: false },
};

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AuthShell eyebrow="Your account" title="Order details" wide>
      <AccountNav current="/account/orders" />
      <OrderDetailPanel id={id} />
    </AuthShell>
  );
}
