import type { Metadata } from "next";
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
import { listingSummary, parseShopQuery } from "@/lib/shop";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * SSR: listings depend on URL filters and opaque cursors (12 per page), so they render per request.
 * Shopify reads underneath are served from the tagged data cache and refreshed by webhooks.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection) return { title: "Collection — Fernwood" };
  const title = `${collection.name} — Fernwood`;
  const hasParams = Object.keys(await searchParams).length > 0;
  return {
    title,
    description: collection.description,
    alternates: { canonical: `/collections/${slug}` },
    // Filtered and paginated variants are for people, not for the search index.
    robots: hasParams ? { index: false, follow: true } : undefined,
    openGraph: {
      title,
      description: collection.description,
      type: "website",
      ...(collection.image ? { images: [{ url: collection.image, alt: collection.name }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      ...(collection.image ? { images: [collection.image] } : {}),
    },
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const query = parseShopQuery(await searchParams);
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

      <CollectionBanner
        image={collection.image}
        title={collection.name}
        tagline={collection.tagline}
      />

      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20 lg:px-8">
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

      <Footer />
    </div>
  );
}
