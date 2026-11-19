import type { Metadata } from "next";

import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import { proseClass } from "@/components/content/prose";

export const metadata: Metadata = {
  title: "Press — Fernwood",
  description: "Press and partnership enquiries.",
  alternates: { canonical: "/press" },
};

export default function Page() {
  return (
    <ContentShell
      eyebrow="Company"
      title="Press"
      intro="Interviews, images and stories from the nursery."
    >
      <div className={proseClass}>
        <p>
          For interviews, product samples, images or partnerships, send us a note and tell us about
          your project and deadline.
        </p>
        <p>
          Fernwood began as a single glasshouse on a family farm in 1962. Read more about{" "}
          <a href="/about">our story</a>.
        </p>
      </div>
      <ContactCta title="Working on a story?" topic="Press and partnerships" label="Contact us" />
    </ContentShell>
  );
}
