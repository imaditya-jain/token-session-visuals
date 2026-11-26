"use client";

import Link from "next/link";
import { useMemo } from "react";

import ListingPagination from "@/components/storefront/ListingPagination";
import ListingToolbar from "@/components/storefront/ListingToolbar";
import ProductCard from "@/components/storefront/ProductCard";
import { Button } from "@/components/ui/button";
import { listingSummary, listProducts } from "@/lib/shop";
import type { Product } from "@/lib/types";
import { interceptLinkClick, navigateListing, useListingQuery } from "@/lib/use-listing-query";

/**
 * The shop/collection listing. It is given the whole list once (the page is prebuilt and cached) and filters, sorts
 * and pages it in the browser, so changing a filter is instant and never waits for a server. The address bar still
 * carries the filters, so any view can be shared and the back button works.
 */
export default function ListingBrowser({
  products,
  types,
  basePath,
  salesOrder,
  empty,
}: {
  products: Product[];
  types: string[];
  basePath: string;
  salesOrder: readonly string[];
  empty: { title: string; text: string };
}) {
  const query = useListingQuery();
  const listed = useMemo(
    () => listProducts(products, query, salesOrder),
    [products, query, salesOrder],
  );
  const shown = { ...query, page: listed.page };
  const pageInfo = {
    hasNextPage: listed.page < listed.pageCount,
    hasPreviousPage: listed.page > 1,
  };
  const paginated = pageInfo.hasNextPage || pageInfo.hasPreviousPage;

  const go = (href: string) => {
    navigateListing(href);
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <ListingToolbar
        query={shown}
        types={types}
        basePath={basePath}
        onNavigate={navigateListing}
      />

      <p className="py-5 text-sm font-medium text-foreground" aria-live="polite">
        {listingSummary(shown, pageInfo, listed.products.length)}
      </p>

      {listed.products.length > 0 ? (
        <div
          className={`grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 ${
            paginated ? "pb-12 lg:pb-16" : "pb-16 lg:pb-24"
          }`}
        >
          {listed.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-display text-xl text-foreground">{empty.title}</p>
          <p className="text-sm text-muted-foreground">{empty.text}</p>
          <Button variant="outline" asChild className="mt-2">
            <Link
              href={basePath}
              onClick={(event) => interceptLinkClick(event, basePath, navigateListing)}
            >
              Clear all filters
            </Link>
          </Button>
        </div>
      )}

      <ListingPagination query={shown} pageInfo={pageInfo} basePath={basePath} onNavigate={go} />
    </>
  );
}
