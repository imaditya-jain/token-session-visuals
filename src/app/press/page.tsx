import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import RichBody from "@/components/content/RichBody";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("press", "/press");

export default async function Page() {
  const c = await getPageContent("press");
  return (
    <ContentShell
      eyebrow={c.text("header", "eyebrow")}
      title={c.text("header", "title")}
      intro={c.text("header", "intro")}
    >
      <RichBody doc={c.doc("body", "content")} />
      <ContactCta
        title={c.text("cta", "title")}
        topic="Press and partnerships"
        label={c.text("cta", "label")}
      />
    </ContentShell>
  );
}
