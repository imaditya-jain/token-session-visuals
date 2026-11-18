import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CollectionProducts from "@/components/storefront/CollectionProducts";
import Header from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/sections";
import { collections, getCollection, getCollectionProducts } from "@/data/catalog";

export function generateStaticParams() {
  return collections.map((collection) => ({ slug: collection.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = getCollection(slug);
  if (!collection) return { title: "Collection — Fernwood" };
  const title = `${collection.name} — Fernwood`;
  return {
    title,
    description: collection.description,
    openGraph: { title, description: collection.description, type: "website" },
    twitter: { card: "summary_large_image" },
  };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = getCollection(slug);
  if (!collection) notFound();
  const products = getCollectionProducts(slug);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Collection banner with the organic wave, like the reference theme */}
      <section className="relative">
        <div className="relative h-[360px] w-full overflow-hidden sm:h-[440px]">
          <img
            src={collection.image}
            alt={collection.name}
            className="absolute inset-0 h-full w-full object-cover"
            width={800}
            height={1000}
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-forest-deep/25 via-transparent to-forest-deep/25" />

          <svg
            className="absolute bottom-0 left-0 z-10 h-12 w-full text-background sm:h-16"
            viewBox="0 0 1440 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              d="M0,100 L0,60 C240,20 420,90 720,45 C1020,0 1200,80 1440,50 L1440,100 Z"
              fill="currentColor"
            />
          </svg>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center">
          <div className="translate-y-1/3 rounded-2xl bg-forest px-8 py-5 text-center shadow-lg sm:px-12 sm:py-6">
            <h1 className="font-display text-3xl font-medium text-cream sm:text-5xl">
              {collection.name}
            </h1>
            <p className="mt-1 text-sm text-cream/85">{collection.tagline}</p>
          </div>
        </div>
      </section>

      <CollectionProducts products={products} />

      {/* Collection blurb + back links */}
      <section className="mx-auto max-w-2xl px-4 pb-20 text-center sm:px-6">
        <p className="text-muted-foreground">{collection.description}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium">
          {collections
            .filter((c) => c.slug !== collection.slug)
            .map((c) => (
              <Link
                key={c.slug}
                href={`/collections/${c.slug}`}
                className="text-forest underline-offset-4 transition-colors hover:text-clay hover:underline"
              >
                {c.name}
              </Link>
            ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
