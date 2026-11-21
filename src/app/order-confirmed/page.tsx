import type { Metadata } from "next";
import Link from "next/link";

import ContentShell from "@/components/content/ContentShell";
import { Button } from "@/components/ui/button";

/**
 * Where a customer lands after paying. Shopify's hosted checkout cannot be forced to redirect after payment, so
 * the thank-you page links here (see docs/HANDOVER.md). The page is static and knows nothing about the order:
 * order details stay behind the signed-in account and Shopify's own confirmation email.
 */
export const metadata: Metadata = {
  title: "Order confirmed — Fernwood",
  description: "Thank you for your order.",
  alternates: { canonical: "/order-confirmed" },
  robots: { index: false, follow: false },
};

export default function OrderConfirmedPage() {
  return (
    <ContentShell
      eyebrow="Thank you"
      title="Order confirmed"
      intro="Your payment went through and your order is on its way to us."
    >
      <div className="space-y-6 rounded-2xl bg-card p-6 text-center shadow-sm ring-1 ring-border/60 sm:p-8">
        <p className="text-base text-foreground/90">
          We have emailed your confirmation. Signed-in customers can follow the order from their
          account.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild className="h-11 px-7">
            <Link href="/account/orders">View my orders</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 px-7">
            <Link href="/shop">Keep shopping</Link>
          </Button>
        </div>
      </div>
    </ContentShell>
  );
}
