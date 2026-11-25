import type { Metadata } from "next";
import Link from "next/link";

import ContentShell from "@/components/content/ContentShell";
import { Button } from "@/components/ui/button";
import { getPageContent } from "@/server/services/page-content-public";

/**
 * Where a customer lands after paying. Shopify's hosted checkout cannot be forced to redirect after payment, so
 * the thank-you page links here (see docs/HANDOVER.md). The page is static and knows nothing about the order:
 * order details stay behind the signed-in account and Shopify's own confirmation email.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Order confirmed — Fernwood",
  description: "Thank you for your order.",
  alternates: { canonical: "/order-confirmed" },
  robots: { index: false, follow: false },
};

export default async function OrderConfirmedPage() {
  const c = await getPageContent("order-confirmed");
  const primary = c.link("message", "primary");
  const secondary = c.link("message", "secondary");
  return (
    <ContentShell
      eyebrow={c.text("header", "eyebrow")}
      title={c.text("header", "title")}
      intro={c.text("header", "intro")}
    >
      <div className="space-y-6 rounded-2xl bg-card p-6 text-center shadow-sm ring-1 ring-border/60 sm:p-8">
        <p className="text-base text-foreground/90">{c.text("message", "text")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild className="h-11 px-7">
            <Link href={primary.href}>{primary.label}</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 px-7">
            <Link href={secondary.href}>{secondary.label}</Link>
          </Button>
        </div>
      </div>
    </ContentShell>
  );
}
