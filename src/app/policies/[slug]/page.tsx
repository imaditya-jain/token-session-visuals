import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ContentShell from "@/components/content/ContentShell";
import { proseClass } from "@/components/content/prose";
import { Button } from "@/components/ui/button";
import { isPolicySlug, POLICY_SLUGS, POLICY_TITLES } from "@/lib/policies";
import { getPolicy } from "@/server/services/policies";

/** ISR: policy text changes rarely; Shopify has no webhook for it, so refresh hourly. */
export const revalidate = 3600;
export const dynamicParams = false;

type Params = Promise<{ slug: string }>;

export const generateStaticParams = () => POLICY_SLUGS.map((slug) => ({ slug }));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  if (!isPolicySlug(slug)) return {};
  const policy = await getPolicy(slug);
  return {
    title: `${policy?.title ?? POLICY_TITLES[slug]} — Fernwood`,
    alternates: { canonical: `/policies/${slug}` },
    // A page without real content must not be indexed.
    ...(policy ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function PolicyPage({ params }: { params: Params }) {
  const { slug } = await params;
  if (!isPolicySlug(slug)) notFound();
  const policy = await getPolicy(slug);

  return (
    <ContentShell eyebrow="Policies" title={policy?.title ?? POLICY_TITLES[slug]}>
      {policy ? (
        // Sanitized with a strict allow-list in `sanitizePolicyHtml`.
        <div className={proseClass} dangerouslySetInnerHTML={{ __html: policy.html }} />
      ) : (
        <div className="space-y-4 rounded-2xl bg-card p-6 text-center shadow-sm ring-1 ring-border/60 sm:p-8">
          <p className="font-display text-xl text-forest">This page is being updated</p>
          <p className="text-sm text-muted-foreground">
            We&apos;re finalising this policy. If you have a question in the meantime, we&apos;re
            happy to help.
          </p>
          <Button asChild className="mt-2">
            <Link href="/contact">Contact us</Link>
          </Button>
        </div>
      )}
    </ContentShell>
  );
}
