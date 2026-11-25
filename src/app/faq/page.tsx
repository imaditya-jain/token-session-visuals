import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import InlineMarkup, { plainText } from "@/components/content/InlineMarkup";
import JsonLd from "@/components/seo/JsonLd";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("faq", "/faq");

export default async function FaqPage() {
  const c = await getPageContent("faq");
  const groups = c.faqs("questions", "groups");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((group) =>
      group.items.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: plainText(item.answer) },
      })),
    ),
  };
  return (
    <ContentShell
      eyebrow={c.text("header", "eyebrow")}
      title={c.text("header", "title")}
      intro={c.text("header", "intro")}
    >
      <JsonLd data={structuredData} />
      <div className="space-y-10">
        {groups.map((group) => (
          <section key={group.title} aria-labelledby={`faq-${group.title}`}>
            <h2
              id={`faq-${group.title}`}
              className="mb-4 font-display text-2xl font-medium text-forest"
            >
              {group.title}
            </h2>
            <div className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/60">
              {group.items.map((item) => (
                <details key={item.question} className="group px-5 py-4 open:pb-5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    {item.question}
                    <span
                      aria-hidden
                      className="text-xl leading-none text-clay transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <div className="pt-2 text-sm leading-relaxed text-muted-foreground">
                    <InlineMarkup text={item.answer} />
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
      <ContactCta
        title={c.text("cta", "title")}
        topic="Something else"
        label={c.text("cta", "label")}
      />
    </ContentShell>
  );
}
