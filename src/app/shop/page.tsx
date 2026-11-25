import ShopListing from "@/components/storefront/ShopListing";
import { shopMetadata } from "@/server/services/listing-metadata";

/**
 * Prebuilt and cached (refreshed hourly and by Shopify webhooks). Filters, sort and paging are applied in the
 * browser, so `/shop?sort=price-asc` is the same cached page: nothing here reads the query string.
 */
export const revalidate = 3600;

export const generateMetadata = () => shopMetadata();

export default function ShopPage() {
  return <ShopListing />;
}
