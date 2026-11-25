import Link from "next/link";

import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import RichBody from "@/components/content/RichBody";
import { proseClass } from "@/components/content/prose";
import { money, store } from "@/data/store-info";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";
import { getPolicy } from "@/server/services/policies";

export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("shipping-delivery", "/shipping-delivery");

const { shipping } = store;

const rates = [
  {
    name: "Standard",
    detail: `Free on orders over ${money(shipping.freeThreshold)}`,
    price: money(shipping.standard),
  },
  { name: "Express", detail: "Faster delivery", price: money(shipping.express) },
  {
    name: "International",
    detail: `Flat rate to ${shipping.countries} countries`,
    price: money(shipping.international),
  },
];

export default async function ShippingDeliveryPage() {
  const [c, policy] = await Promise.all([
    getPageContent("shipping-delivery"),
    getPolicy("shipping-policy"),
  ]);

  return (
    <ContentShell
      eyebrow={c.text("header", "eyebrow")}
      title={c.text("header", "title")}
      intro={c.text("header", "intro")}
    >
      <h2 className="mb-4 font-display text-2xl font-medium text-forest">Shipping rates</h2>
      <div className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Shipping rates in {store.currency}</caption>
          <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">
                Method
              </th>
              <th scope="col" className="px-5 py-3 font-semibold">
                Details
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">
                Price
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rates.map((rate) => (
              <tr key={rate.name}>
                <th
                  scope="row"
                  className="px-5 py-4 font-display text-base font-medium text-forest"
                >
                  {rate.name}
                </th>
                <td className="px-5 py-4 text-muted-foreground">{rate.detail}</td>
                <td className="px-5 py-4 text-right font-semibold text-forest">{rate.price}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Prices are in {store.currency}. Checkout shows the exact rate for your address before you
        pay.
      </p>

      <RichBody doc={c.doc("body", "content")} className="mt-10" />
      {policy ? (
        <p className={`${proseClass} -mt-2`}>
          For the complete terms, read our{" "}
          <Link href="/policies/shipping-policy">full shipping policy</Link>.
        </p>
      ) : null}

      <ContactCta
        title={c.text("cta", "title")}
        topic="Order or delivery"
        label={c.text("cta", "label")}
      />
    </ContentShell>
  );
}
