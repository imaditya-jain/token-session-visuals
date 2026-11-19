import type { Metadata } from "next";

import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import { proseClass } from "@/components/content/prose";

export const metadata: Metadata = {
  title: "Careers — Fernwood",
  description: "Careers at Fernwood: tell us about yourself.",
  alternates: { canonical: "/careers" },
};

export default function Page() {
  return (
    <ContentShell
      eyebrow="Company"
      title="Careers"
      intro="Join the people who grow, pack and care for Fernwood plants."
    >
      <div className={proseClass}>
        <p>
          We do not have any open roles listed at the moment. If you grow, pack or care for plants
          for a living, or you simply love them, we would still like to hear from you.
        </p>
        <p>
          Tell us a little about yourself and what you would like to do, and we will keep it in
          mind.
        </p>
      </div>
      <ContactCta title="Interested in working with us?" topic="Careers" label="Get in touch" />
    </ContentShell>
  );
}
