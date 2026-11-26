import Link from "next/link";
import { notFound } from "next/navigation";

import CollectionBanner from "@/components/storefront/CollectionBanner";
import Header from "@/components/storefront/Header";
import ListingBrowser from "@/components/storefront/ListingBrowser";
import { Footer } from "@/components/storefront/sections";
import { getCollection, getCollectionAll, getCollections, getSalesOrder } from "@/data/catalog";

/**
 * One collection. Prebuilt and cached; it carries the collection's products once and the browser filters, sorts and
 * pages them (see ListingBrowser).
 */
export default async function CollectionListing({ slug }: { slug: string }) {
  const [collection, products, collections, salesOrder] = await Promise.all([
    getCollection(slug),
    getCollectionAll(slug),
    getCollections(),
    getSalesOrder(slug),
  ]);
  if (!collection || !products) notFound();

  const basePath = `/collections/${collection.slug}`;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <CollectionBanner
          image={collection.image}
          title={collection.name}
          tagline={collection.tagline}
        />

        <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20 lg:px-8">
          <h2 className="sr-only">Products</h2>
          <ListingBrowser
            products={products}
            types={[]}
            basePath={basePath}
            salesOrder={salesOrder}
            empty={{
              title: "No products match your filters",
              text: "Try widening the price range or clearing availability.",
            }}
          />
        </section>

        {/* Collection blurb + back links */}
        <section className="mx-auto max-w-2xl px-4 pb-20 text-center sm:px-6">
          <p className="text-muted-foreground">{collection.description}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium">
            {collections
              .filter((c) => c.slug !== collection.slug)
              .map((c) => (
                <Link
                  key={c.slug}
                  href={`/collections/${c.slug}`}
                  className="text-forest underline-offset-4 transition-colors hover:text-clay hover:underline"
                >
                  {c.name}
                </Link>
              ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
