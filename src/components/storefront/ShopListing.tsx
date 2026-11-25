import Link from "next/link";

import CollectionBanner from "@/components/storefront/CollectionBanner";
import Header from "@/components/storefront/Header";
import ListingPagination from "@/components/storefront/ListingPagination";
import ListingToolbar from "@/components/storefront/ListingToolbar";
import ProductCard from "@/components/storefront/ProductCard";
import { Footer } from "@/components/storefront/sections";
import { Button } from "@/components/ui/button";
import { getProductTypes, getShopPage } from "@/data/catalog";
import { listingSummary, SHOP_PATH, type ShopQuery } from "@/lib/shop";
import { getPageContent } from "@/server/services/page-content-public";

/**
 * The shop listing for one query. The same component renders the prebuilt default view (`/listing/shop`, served
 * as a cached page) and every filtered or paged view (`/shop?...`, rendered per request), so both look identical.
 */
export default async function ShopListing({ query }: { query: ShopQuery }) {
  const [{ products, pageInfo }, types, c] = await Promise.all([
    getShopPage(query),
    getProductTypes(),
    getPageContent("shop"),
  ]);

  const paginated = pageInfo.hasNextPage || pageInfo.hasPreviousPage;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <CollectionBanner
          image="/images/seasonal-greenhouse.jpg"
          title={c.text("header", "title")}
          tagline={c.text("header", "eyebrow")}
        />

        <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20 lg:px-8">
          <h2 className="sr-only">Products</h2>
          <ListingToolbar query={query} types={types} basePath={SHOP_PATH} />

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
              <p className="font-display text-xl text-foreground">{c.text("empty", "title")}</p>
              <p className="text-sm text-muted-foreground">{c.text("empty", "text")}</p>
              <Button variant="outline" asChild className="mt-2">
                <Link href={SHOP_PATH}>Clear all filters</Link>
              </Button>
            </div>
          )}

          <ListingPagination query={query} pageInfo={pageInfo} basePath={SHOP_PATH} />
        </section>
      </main>
      <Footer />
    </div>
  );
}
