import type { Metadata } from "next";

import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import { proseClass } from "@/components/content/prose";

export const metadata: Metadata = {
  title: "Sustainability — Fernwood",
  description:
    "How Fernwood grows: nursery-grown, peat-free soils, integrated pest management and recycled packaging.",
  alternates: { canonical: "/sustainability" },
};

export default function Page() {
  return (
    <ContentShell
      eyebrow="Company"
      title="Sustainability"
      intro="Growing well, for people and the planet."
    >
      <div className={proseClass}>
        <h2>Nursery-grown, not brokered</h2>
        <p>
          Every plant is raised in our own greenhouses, never brokered from unknown sources, so we
          know how it was grown.
        </p>
        <h2>Peat-free soils</h2>
        <p>
          We grow in peat-free soils, protecting peatlands that store carbon and shelter wildlife.
        </p>
        <h2>Fewer sprays</h2>
        <p>
          We use integrated pest management instead of sprays, working with beneficial insects and
          careful monitoring.
        </p>
        <h2>Recycled packaging</h2>
        <p>
          Plants travel in protective, recycled packaging designed so they arrive ready to thrive.
        </p>
      </div>
      <ContactCta title="Questions about how we grow?" topic="Something else" label="Ask us" />
    </ContentShell>
  );
}
