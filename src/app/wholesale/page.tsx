import ContentShell from "@/components/content/ContentShell";
import RichBody from "@/components/content/RichBody";
import WholesaleForm from "@/components/wholesale/WholesaleForm";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("wholesale", "/wholesale");

export default async function Page() {
  const c = await getPageContent("wholesale");
  return (
    <ContentShell
      eyebrow={c.text("header", "eyebrow")}
      title={c.text("header", "title")}
      intro={c.text("header", "intro")}
    >
      <RichBody doc={c.doc("body", "content")} />
      <div className="mt-8 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8">
        <WholesaleForm />
      </div>
    </ContentShell>
  );
}
