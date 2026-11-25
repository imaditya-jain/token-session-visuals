import type { Metadata } from "next";

import CollectionListing from "@/components/storefront/CollectionListing";
import { parseShopQuery } from "@/lib/shop";
import { collectionMetadata } from "@/server/services/listing-metadata";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * SSR: listings depend on URL filters and opaque cursors (12 per page), so these views render per request. A
 * collection without filters never gets here: `next.config.ts` serves it from the prebuilt `/listing/collections/<slug>`.
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
  return collectionMetadata(slug, Object.keys(await searchParams).length > 0);
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  return <CollectionListing slug={slug} query={parseShopQuery(await searchParams)} />;
}
