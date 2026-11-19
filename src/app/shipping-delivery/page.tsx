import type { Metadata } from "next";
import Link from "next/link";

import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import { proseClass } from "@/components/content/prose";
import { money, store } from "@/data/store-info";
import { getPolicy } from "@/server/services/policies";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Shipping & delivery — Fernwood",
  description: `Shipping rates, free shipping over ${money(store.shipping.freeThreshold)}, and how your plants are packed and delivered.`,
  alternates: { canonical: "/shipping-delivery" },
};

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
  const policy = await getPolicy("shipping-policy");

  return (
    <ContentShell
      eyebrow="Help"
      title="Shipping & delivery"
      intro="Every plant leaves our greenhouse in protective, plant-friendly packaging. Here is what shipping costs and how it works."
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

      <div className={`${proseClass} mt-10`}>
        <h2>How we pack</h2>
        <p>
          Plants are packed with protective, recycled packaging so they arrive ready to thrive.
          Every order includes a detailed care card for the plants inside.
        </p>

        <h2>Where we ship</h2>
        <p>
          We ship to {shipping.countries} countries. If yours is on the list, checkout will offer it
          once you enter your address. Duties and taxes for international orders are shown at
          checkout where they apply.
        </p>

        <h2>Tracking your order</h2>
        <p>
          Sign in and open <Link href="/account/orders">My orders</Link> to see the status of every
          order. Confirm your email address first so your order history is available.
        </p>

        <h2>If something goes wrong</h2>
        <p>
          If a plant arrives damaged or unhappy, our{" "}
          <Link href="/plant-guarantee">plant guarantee</Link> has you covered.
        </p>
        {policy ? (
          <p>
            For the complete terms, read our{" "}
            <Link href="/policies/shipping-policy">full shipping policy</Link>.
          </p>
        ) : null}
      </div>

      <ContactCta title="Questions about a delivery?" topic="Order or delivery" />
    </ContentShell>
  );
}
