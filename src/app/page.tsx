import JsonLd from "@/components/seo/JsonLd";
import HomePage from "@/components/storefront/HomePage";
import { store } from "@/data/store-info";
import { organizationJsonLd, websiteJsonLd } from "@/lib/structured-data";
import { publicOrigin } from "@/server/config/site";

/** ISR: prerendered at build, refreshed hourly and on demand via Shopify webhooks (cache tags). */
export const revalidate = 3600;

export default function Page() {
  const origin = publicOrigin();
  return (
    <>
      <JsonLd
        data={organizationJsonLd(origin, {
          name: store.name,
          email: store.email,
          logo: "/images/hero-plants.jpg",
        })}
      />
      <JsonLd data={websiteJsonLd(origin, store.name)} />
      <HomePage />
    </>
  );
}
