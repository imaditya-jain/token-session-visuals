import type { Metadata } from "next";

import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import { proseClass } from "@/components/content/prose";
import { store } from "@/data/store-info";

export const metadata: Metadata = {
  title: "Accessibility — Fernwood",
  description:
    "How we work to make the Fernwood store usable by everyone, and how to tell us about a problem.",
  alternates: { canonical: "/accessibility" },
};

export default function AccessibilityPage() {
  return (
    <ContentShell
      eyebrow="Company"
      title="Accessibility"
      intro="We want everyone to be able to browse, shop and manage their account on our store."
    >
      <div className={proseClass}>
        <h2>What we do</h2>
        <ul>
          <li>
            Pages use clear headings, landmarks and labelled form fields so screen readers can
            navigate them.
          </li>
          <li>
            Everything can be used with a keyboard, with visible focus on links, buttons and form
            fields.
          </li>
          <li>Buttons and links on touch screens are sized to be easy to tap.</li>
          <li>Text and controls use colours chosen for readable contrast.</li>
          <li>Product images have descriptive text alternatives.</li>
        </ul>

        <h2>Our aim</h2>
        <p>
          We aim to follow the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA. We are
          always improving, and some parts of the store may not meet that standard yet.
        </p>

        <h2>Tell us about a problem</h2>
        <p>
          If something is hard to use, or you need information in another format, please tell us
          what you were trying to do and what got in the way. You can also email{" "}
          <a href={`mailto:${store.email}`}>{store.email}</a> or call{" "}
          <a href={store.phoneHref}>{store.phone}</a> ({store.hours}).
        </p>
      </div>
      <ContactCta
        title="Found an accessibility problem?"
        topic="Something else"
        label="Report it"
      />
    </ContentShell>
  );
}
