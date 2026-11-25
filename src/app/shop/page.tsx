import type { Metadata } from "next";

import ShopListing from "@/components/storefront/ShopListing";
import { parseShopQuery } from "@/lib/shop";
import { shopMetadata } from "@/server/services/listing-metadata";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * SSR: results depend on URL filters and opaque cursors, so these views render per request. The plain `/shop`
 * (no filters) never gets here: `next.config.ts` serves it from the prebuilt `/listing/shop`. Shopify reads
 * underneath are still served from the tagged data cache, keeping origin cost low.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  return shopMetadata(Object.keys(await searchParams).length > 0);
}

export default async function ShopPage({ searchParams }: { searchParams: SearchParams }) {
  return <ShopListing query={parseShopQuery(await searchParams)} />;
}
