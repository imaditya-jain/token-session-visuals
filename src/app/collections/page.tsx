import Link from "next/link";

import CollectionBanner from "@/components/storefront/CollectionBanner";
import CollectionCard from "@/components/storefront/CollectionCard";
import Header from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/sections";
import { Button } from "@/components/ui/button";
import { getCollections } from "@/data/catalog";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

/** ISR like the other catalog pages: tagged Shopify reads plus hourly refresh. */
export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("collections", "/collections");

export default async function CollectionsPage() {
  const [collections, c] = await Promise.all([getCollections(), getPageContent("collections")]);
  const empty = c.link("empty", "button");

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <CollectionBanner
          image="/images/seasonal-greenhouse.jpg"
          title={c.text("header", "title")}
          tagline={c.text("header", "eyebrow")}
        />
        <section className="mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 sm:pt-20 lg:px-8 lg:pb-28">
          <h2 className="sr-only">All collections</h2>
          {collections.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
              {collections.map((collection) => (
                <CollectionCard key={collection.slug} collection={collection} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="font-display text-xl text-foreground">{c.text("empty", "title")}</p>
              <Button variant="outline" asChild className="mt-2">
                <Link href={empty.href}>{empty.label}</Link>
              </Button>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
