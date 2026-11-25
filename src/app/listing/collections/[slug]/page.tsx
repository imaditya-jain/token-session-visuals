import CollectionListing from "@/components/storefront/CollectionListing";
import { getCollections } from "@/data/catalog";
import { parseShopQuery } from "@/lib/shop";
import { collectionMetadata } from "@/server/services/listing-metadata";

/**
 * A collection without filters, built ahead of time and cached (refreshed hourly and by Shopify webhooks).
 * Visitors never see this address: `next.config.ts` serves it for a plain `/collections/<slug>` and redirects any
 * direct visit here back to the real address. Collections added later are built on their first visit.
 */
export const revalidate = 3600;

export async function generateStaticParams() {
  return (await getCollections()).map((collection) => ({ slug: collection.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return collectionMetadata((await params).slug, false);
}

export default async function StaticCollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <CollectionListing slug={(await params).slug} query={parseShopQuery({})} />;
}
