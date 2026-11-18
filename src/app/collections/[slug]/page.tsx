import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import CollectionBanner from "@/components/storefront/CollectionBanner";
import CollectionProducts from "@/components/storefront/CollectionProducts";
import Header from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/sections";
import { getCollection, getCollectionProducts, getCollections } from "@/data/catalog";

/** ISR: prerendered at build, refreshed hourly and on demand via Shopify webhooks (cache tags). */
export const revalidate = 3600;

export async function generateStaticParams() {
  return (await getCollections()).map((collection) => ({ slug: collection.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollection(slug);
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
  const [collection, products, collections] = await Promise.all([
    getCollection(slug),
    getCollectionProducts(slug),
    getCollections(),
  ]);
  if (!collection) notFound();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <CollectionBanner
        image={collection.image}
        title={collection.name}
        tagline={collection.tagline}
      />
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
