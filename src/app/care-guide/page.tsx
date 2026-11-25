import Link from "next/link";

import ContentShell from "@/components/content/ContentShell";
import RichBody from "@/components/content/RichBody";
import { Button } from "@/components/ui/button";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("care-guide", "/care-guide");

export default async function CareGuidePage() {
  const c = await getPageContent("care-guide");
  const cta = c.link("help", "cta");
  return (
    <ContentShell
      eyebrow={c.text("header", "eyebrow")}
      title={c.text("header", "title")}
      intro={c.text("header", "intro")}
    >
      <RichBody doc={c.doc("body", "content")} />

      <div className="mt-12 flex flex-wrap items-center gap-3 rounded-2xl bg-sage-light/50 p-6">
        <p className="mr-auto font-display text-lg text-forest">{c.text("help", "title")}</p>
        <Button asChild className="h-11 px-7">
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      </div>
    </ContentShell>
  );
}
