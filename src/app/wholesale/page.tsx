import type { Metadata } from "next";

import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import { proseClass } from "@/components/content/prose";

export const metadata: Metadata = {
  title: "Wholesale — Fernwood",
  description: "Wholesale enquiries for businesses.",
  alternates: { canonical: "/wholesale" },
};

export default function Page() {
  return (
    <ContentShell
      eyebrow="Company"
      title="Wholesale"
      intro="Plants and pots for cafés, studios, florists and garden centres."
    >
      <div className={proseClass}>
        <p>
          Fernwood plants are nursery-grown in our own greenhouses, so we know exactly what we can
          supply and when. If you are planting up a business or reselling, we would be glad to talk.
        </p>
        <p>
          Tell us what you are looking for, roughly how much and where it is going, and we will come
          back to you.
        </p>
      </div>
      <ContactCta title="Interested in wholesale?" topic="Wholesale" label="Ask about wholesale" />
    </ContentShell>
  );
}
