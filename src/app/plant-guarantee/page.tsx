import type { Metadata } from "next";
import Link from "next/link";

import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import { proseClass } from "@/components/content/prose";
import { store } from "@/data/store-info";
import { getPolicy } from "@/server/services/policies";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Plant guarantee — Fernwood",
  description: `Our ${store.guaranteeDays}-day arrive-alive guarantee: if your plant arrives unhappy, we replace it.`,
  alternates: { canonical: "/plant-guarantee" },
};

export default async function PlantGuaranteePage() {
  const policy = await getPolicy("refund-policy");

  return (
    <ContentShell
      eyebrow="Help"
      title="Plant guarantee"
      intro={`Protective packaging and a ${store.guaranteeDays}-day guarantee. If it arrives unhappy, we replace it.`}
    >
      <div className={proseClass}>
        <h2>Our promise</h2>
        <p>
          Every plant is raised in our own greenhouses and checked by a grower before it ships. If
          your plant arrives damaged or unhappy, we will replace it. That is our{" "}
          {store.guaranteeDays}
          -day arrive-alive guarantee.
        </p>

        <h2>How to claim</h2>
        <ol>
          <li>
            <Link href="/contact?topic=Returns%20or%20guarantee">Contact us</Link> within{" "}
            {store.guaranteeDays} days with your order number.
          </li>
          <li>Include a clear photo of the plant and its packaging so we can see what happened.</li>
          <li>We will take it from there and make it right.</li>
        </ol>

        <h2>Helping your plant settle in</h2>
        <p>
          A little leaf drop after a journey is normal while a plant adjusts to new light. Our{" "}
          <Link href="/care-guide">care guide</Link> covers light, watering and troubleshooting, and
          our horticulturists are happy to look at photos.
        </p>
        {policy ? (
          <p>
            For the complete terms, read our{" "}
            <Link href="/policies/refund-policy">full returns policy</Link>.
          </p>
        ) : null}
      </div>

      <ContactCta
        title="Plant arrived unhappy?"
        topic="Returns or guarantee"
        label="Start a claim"
      />
    </ContentShell>
  );
}
