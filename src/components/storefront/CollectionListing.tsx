import Link from "next/link";
import { notFound } from "next/navigation";

import CollectionBanner from "@/components/storefront/CollectionBanner";
import Header from "@/components/storefront/Header";
import ListingPagination from "@/components/storefront/ListingPagination";
import ListingToolbar from "@/components/storefront/ListingToolbar";
import ProductCard from "@/components/storefront/ProductCard";
import { Footer } from "@/components/storefront/sections";
import { Button } from "@/components/ui/button";
import { getCollection, getCollectionPage, getCollections } from "@/data/catalog";
import { listingSummary, type ShopQuery } from "@/lib/shop";

/** One collection's listing for one query: shared by the prebuilt default view and the per-request filtered views. */
export default async function CollectionListing({
  slug,
  query,
}: {
  slug: string;
  query: ShopQuery;
}) {
  const [collection, page, collections] = await Promise.all([
    getCollection(slug),
    getCollectionPage(slug, query),
    getCollections(),
  ]);
  if (!collection || !page) notFound();

  const basePath = `/collections/${collection.slug}`;
  const { products, pageInfo } = page;
  const paginated = pageInfo.hasNextPage || pageInfo.hasPreviousPage;

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
          <ListingToolbar query={query} types={[]} basePath={basePath} />

          <p className="py-5 text-sm font-medium text-foreground" aria-live="polite">
            {listingSummary(query, pageInfo, products.length)}
          </p>

          {products.length > 0 ? (
            <div
              className={`grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 ${
                paginated ? "pb-12 lg:pb-16" : "pb-16 lg:pb-24"
              }`}
            >
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="font-display text-xl text-foreground">No products match your filters</p>
              <p className="text-sm text-muted-foreground">
                Try widening the price range or clearing availability.
              </p>
              <Button variant="outline" asChild className="mt-2">
                <Link href={basePath}>Clear all filters</Link>
              </Button>
            </div>
          )}

          <ListingPagination query={query} pageInfo={pageInfo} basePath={basePath} />
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
