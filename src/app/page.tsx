import HomePage from "@/components/storefront/HomePage";

/** ISR: prerendered at build, refreshed hourly and on demand via Shopify webhooks (cache tags). */
export const revalidate = 3600;

export default function Page() {
  return <HomePage />;
}
