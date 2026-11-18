import type { Metadata } from "next";
import { Suspense } from "react";

import AccountNav from "@/components/account/AccountNav";
import OrdersPanel from "@/components/account/OrdersPanel";
import AuthShell from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "My orders — Fernwood",
  robots: { index: false, follow: false },
  alternates: { canonical: "/account/orders" },
};

export default function OrdersPage() {
  return (
    <AuthShell eyebrow="Your account" title="My orders" wide>
      <AccountNav current="/account/orders" />
      <Suspense>
        <OrdersPanel />
      </Suspense>
    </AuthShell>
  );
}
