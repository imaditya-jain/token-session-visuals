import Image from "next/image";
import Link from "next/link";

import ContentShell from "@/components/content/ContentShell";
import RichBody from "@/components/content/RichBody";
import { Button } from "@/components/ui/button";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("about", "/about");

export default async function AboutPage() {
  const c = await getPageContent("about");
  const picture = c.image("story", "image");
  const primary = c.link("actions", "primary");
  const secondary = c.link("actions", "secondary");
  return (
    <ContentShell eyebrow={c.text("header", "eyebrow")} title={c.text("header", "title")}>
      <Image
        src={picture.src}
        alt={picture.alt}
        width={1200}
        height={900}
        sizes="(min-width: 768px) 768px, 100vw"
        priority
        className="aspect-[5/4] w-full rounded-2xl object-cover shadow-xl"
      />

      <h2 id="our-story" className="mt-10 font-display text-3xl font-medium text-forest">
        {c.text("story", "title")}
      </h2>
      <RichBody doc={c.doc("story", "content")} className="mt-4" />

      <h2 className="mb-6 mt-14 font-display text-2xl font-medium text-forest">
        {c.text("principles", "title")}
      </h2>
      <dl className="grid gap-6 sm:grid-cols-2">
        {c.cards("principles", "items").map((item) => (
          <div key={item.title} className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60">
            <dt className="font-display text-lg font-medium text-forest">{item.title}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-12 flex flex-wrap gap-3">
        <Button asChild className="h-11 px-7">
          <Link href={primary.href}>{primary.label}</Link>
        </Button>
        <Button asChild variant="outline" className="h-11 px-7">
          <Link href={secondary.href}>{secondary.label}</Link>
        </Button>
      </div>
    </ContentShell>
  );
}
