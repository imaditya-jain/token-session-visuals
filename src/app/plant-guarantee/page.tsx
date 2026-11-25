import Link from "next/link";

import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import RichBody from "@/components/content/RichBody";
import { proseClass } from "@/components/content/prose";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";
import { getPolicy } from "@/server/services/policies";

export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("plant-guarantee", "/plant-guarantee");

export default async function PlantGuaranteePage() {
  const [c, policy] = await Promise.all([
    getPageContent("plant-guarantee"),
    getPolicy("refund-policy"),
  ]);

  return (
    <ContentShell
      eyebrow={c.text("header", "eyebrow")}
      title={c.text("header", "title")}
      intro={c.text("header", "intro")}
    >
      <RichBody doc={c.doc("body", "content")} />
      {policy ? (
        <p className={`${proseClass} -mt-2`}>
          For the complete terms, read our{" "}
          <Link href="/policies/refund-policy">full returns policy</Link>.
        </p>
      ) : null}

      <ContactCta
        title={c.text("cta", "title")}
        topic="Returns or guarantee"
        label={c.text("cta", "label")}
      />
    </ContentShell>
  );
}
