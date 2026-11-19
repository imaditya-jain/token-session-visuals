import type { Metadata } from "next";

import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import ProductCard from "@/components/storefront/ProductCard";
import { getShopPage } from "@/data/catalog";
import { parseShopQuery } from "@/lib/shop";

/** Gift cards are ordinary Shopify products of type "Gift Card", so the merchant manages them in admin. */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Gift cards — Fernwood",
  description: "Give the gift of greenery with a Fernwood gift card.",
  alternates: { canonical: "/gift-cards" },
};

export default async function GiftCardsPage() {
  const { products } = await getShopPage(parseShopQuery({ type: "Gift Card" }));

  return (
    <ContentShell
      eyebrow="Gifts"
      title="Gift cards"
      intro="Not sure which plant? Let them choose. A Fernwood gift card is the easy way to give greenery."
    >
      {products.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-card p-6 text-center shadow-sm ring-1 ring-border/60 sm:p-8">
          <p className="font-display text-xl text-forest">Gift cards are coming soon</p>
          <p className="mt-2 text-sm text-muted-foreground">
            We are getting them ready. Ask us and we will let you know as soon as they are
            available.
          </p>
        </div>
      )}
      <ContactCta title="Want to give a gift now?" topic="Something else" label="Talk to us" />
    </ContentShell>
  );
}
