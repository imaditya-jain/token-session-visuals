import type { Metadata } from "next";
import Link from "next/link";

import CollectionBanner from "@/components/storefront/CollectionBanner";
import CollectionCard from "@/components/storefront/CollectionCard";
import Header from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/sections";
import { Button } from "@/components/ui/button";
import { getCollections } from "@/data/catalog";

/** ISR like the other catalog pages: tagged Shopify reads plus hourly refresh. */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "All collections — Fernwood",
  description:
    "Browse every Fernwood collection: house plants, succulents, pots and planters, seeds and tools.",
  alternates: { canonical: "/collections" },
};

export default async function CollectionsPage() {
  const collections = await getCollections();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <CollectionBanner
        image="/images/seasonal-greenhouse.jpg"
        title="Collections"
        tagline="Curated for every corner of your home"
      />
      <section className="mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 sm:pt-20 lg:px-8 lg:pb-28">
        {collections.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {collections.map((collection) => (
              <CollectionCard key={collection.slug} collection={collection} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-display text-xl text-foreground">Collections are on their way</p>
            <Button variant="outline" asChild className="mt-2">
              <Link href="/shop">Shop all plants</Link>
            </Button>
          </div>
        )}
      </section>
      <Footer />
    </div>
  );
}
