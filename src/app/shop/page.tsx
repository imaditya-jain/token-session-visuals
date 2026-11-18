import type { Metadata } from "next";
import Link from "next/link";

import CollectionBanner from "@/components/storefront/CollectionBanner";
import Header from "@/components/storefront/Header";
import ProductCard from "@/components/storefront/ProductCard";
import { Footer } from "@/components/storefront/sections";
import ShopPagination from "@/components/storefront/ShopPagination";
import ShopToolbar from "@/components/storefront/ShopToolbar";
import { Button } from "@/components/ui/button";
import { getProductTypes, getShopPage } from "@/data/catalog";
import { parseShopQuery, SHOP_PATH } from "@/lib/shop";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TITLE = "Shop all plants — Fernwood";
const DESCRIPTION =
  "Browse every plant, pot and garden tool from all Fernwood collections. Filter by availability, price and type.";

/**
 * SSR: results depend on URL filters and opaque cursors, so the page renders per request. Shopify reads
 * underneath are still served from the tagged data cache, keeping origin cost low.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const hasParams = Object.keys(await searchParams).length > 0;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: SHOP_PATH },
    // Filtered and paginated variants are for people, not for the search index.
    robots: hasParams ? { index: false, follow: true } : undefined,
    openGraph: { title: TITLE, description: DESCRIPTION, type: "website" },
    twitter: { card: "summary_large_image" },
  };
}

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseShopQuery(await searchParams);
  const [{ products, pageInfo }, types] = await Promise.all([
    getShopPage(query),
    getProductTypes(),
  ]);

  const firstItem = (query.page - 1) * 12 + 1;
  const range =
    products.length === 0
      ? "0 products"
      : products.length === 1
        ? `Showing ${firstItem} product`
        : `Showing ${firstItem}–${firstItem + products.length - 1} products`;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <CollectionBanner
        image="/images/seasonal-greenhouse.jpg"
        title="Shop all"
        tagline="Every plant, pot and tool in the greenhouse"
      />

      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20 lg:px-8">
        <ShopToolbar query={query} types={types} />

        <p className="py-5 text-sm font-medium text-foreground" aria-live="polite">
          {range}
        </p>

        {products.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 pb-12 sm:gap-6 lg:grid-cols-4 lg:pb-16">
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
              <Link href={SHOP_PATH}>Clear all filters</Link>
            </Button>
          </div>
        )}

        <ShopPagination query={query} pageInfo={pageInfo} />
      </section>

      <Footer />
    </div>
  );
}
