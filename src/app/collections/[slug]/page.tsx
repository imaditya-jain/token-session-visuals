import CollectionListing from "@/components/storefront/CollectionListing";
import { getCollections } from "@/data/catalog";
import { collectionMetadata } from "@/server/services/listing-metadata";

/**
 * Prebuilt and cached (refreshed hourly and by Shopify webhooks). Filters, sort and paging are applied in the
 * browser, so `/collections/<slug>?sort=price-asc` is the same cached page. Collections added later are built on
 * their first visit.
 */
export const revalidate = 3600;

export async function generateStaticParams() {
  return (await getCollections()).map((collection) => ({ slug: collection.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return collectionMetadata((await params).slug);
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  return <CollectionListing slug={(await params).slug} />;
}
