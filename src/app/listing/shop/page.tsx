import ShopListing from "@/components/storefront/ShopListing";
import { parseShopQuery } from "@/lib/shop";
import { shopMetadata } from "@/server/services/listing-metadata";

/**
 * The shop without filters, built ahead of time and cached (refreshed hourly and by Shopify webhooks), so the most
 * visited listing never waits for a server. Visitors never see this address: `next.config.ts` serves it for a plain
 * `/shop` and redirects any direct visit here back to `/shop`.
 */
export const revalidate = 3600;

export const generateMetadata = () => shopMetadata(false);

export default function StaticShopPage() {
  return <ShopListing query={parseShopQuery({})} />;
}
