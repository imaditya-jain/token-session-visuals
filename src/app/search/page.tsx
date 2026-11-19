import type { Metadata } from "next";
import Link from "next/link";

import CollectionBanner from "@/components/storefront/CollectionBanner";
import Header from "@/components/storefront/Header";
import ListingPagination from "@/components/storefront/ListingPagination";
import ListingToolbar from "@/components/storefront/ListingToolbar";
import ProductCard from "@/components/storefront/ProductCard";
import { Footer } from "@/components/storefront/sections";
import { Button } from "@/components/ui/button";
import { getProductTypes, getShopPage } from "@/data/catalog";
import { listingSummary, parseShopQuery } from "@/lib/shop";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SEARCH_PATH = "/search";

/** SSR per request: results depend on the query string. Never indexed (thin, infinite URL space). */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { search } = parseShopQuery(await searchParams);
  return {
    title: search ? `Search: ${search} — Fernwood` : "Search — Fernwood",
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseShopQuery(await searchParams);
  const searching = query.search !== undefined;
  const [{ products, pageInfo }, types] = searching
    ? await Promise.all([getShopPage(query), getProductTypes()])
    : [{ products: [], pageInfo: { hasNextPage: false, hasPreviousPage: false } }, []];

  const paginated = pageInfo.hasNextPage || pageInfo.hasPreviousPage;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <CollectionBanner
        image="/images/seasonal-greenhouse.jpg"
        title="Search"
        tagline={searching ? `Results for “${query.search}”` : "Find plants, pots and tools"}
      />

      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20 lg:px-8">
        {searching ? (
          <>
            <ListingToolbar query={query} types={types} basePath={SEARCH_PATH} />

            <p className="py-5 text-sm font-medium text-foreground" aria-live="polite">
              {listingSummary(query, pageInfo, products.length)}
            </p>
          </>
        ) : null}

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
            <p className="font-display text-xl text-foreground">
              {searching ? `No results for “${query.search}”` : "What are you looking for?"}
            </p>
            <p className="text-sm text-muted-foreground">
              {searching
                ? "Check the spelling, try a shorter word, or browse everything."
                : "Use the search icon in the header to look for a plant, pot or tool."}
            </p>
            <Button variant="outline" asChild className="mt-2">
              <Link href="/shop">Shop all plants</Link>
            </Button>
          </div>
        )}

        {searching ? (
          <ListingPagination query={query} pageInfo={pageInfo} basePath={SEARCH_PATH} />
        ) : null}
      </section>

      <Footer />
    </div>
  );
}
