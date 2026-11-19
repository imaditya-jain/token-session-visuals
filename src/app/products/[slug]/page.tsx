import JsonLd from "@/components/seo/JsonLd";
import { store } from "@/data/store-info";
import { productJsonLd } from "@/lib/structured-data";
import { publicOrigin } from "@/server/config/site";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import Header from "@/components/storefront/Header";
import ProductCard from "@/components/storefront/ProductCard";
import { Footer } from "@/components/storefront/sections";
import { Button } from "@/components/ui/button";
import {
  formatPrice,
  getCollection,
  getProduct,
  getProducts,
  getRelatedProducts,
} from "@/data/catalog";

/** ISR: prerendered at build, refreshed hourly and on demand via Shopify webhooks (cache tags). */
export const revalidate = 3600;

export async function generateStaticParams() {
  return (await getProducts()).map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Product — Fernwood" };
  const title = `${product.name} — Fernwood`;
  const description = `${product.name} from Fernwood. Explore product details, availability, and care information.`;
  return {
    title,
    description,
    alternates: { canonical: `/products/${slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      ...(product.image ? { images: [{ url: product.image, alt: product.name }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      ...(product.image ? { images: [product.image] } : {}),
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const collectionSlug = product.collectionSlugs[0];
  const [collection, relatedProducts] = await Promise.all([
    collectionSlug ? getCollection(collectionSlug) : undefined,
    getRelatedProducts(product),
  ]);
  const detailLabel =
    product.category === "House Plants" || product.category === "Succulents & Cacti"
      ? "Light"
      : "Details";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <JsonLd data={productJsonLd(product, publicOrigin(), store.currency)} />
      <Header />
      <main>
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <Link href="/" className="transition-colors hover:text-forest">
              Home
            </Link>
            <span aria-hidden="true">/</span>
            {collection ? (
              <>
                <Link
                  href={`/collections/${collection.slug}`}
                  className="transition-colors hover:text-forest"
                >
                  {collection.name}
                </Link>
                <span aria-hidden="true">/</span>
              </>
            ) : null}
            <span className="text-foreground">{product.name}</span>
          </nav>
        </div>

        <section className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 md:grid-cols-2 md:gap-12 lg:px-8 lg:py-14">
          <div className="overflow-hidden rounded-md bg-sand">
            <Image
              src={product.image}
              alt={product.name}
              priority
              width={800}
              height={1000}
              sizes="(min-width: 1280px) 600px, (min-width: 768px) 50vw, 100vw"
              className="aspect-[4/5] w-full object-cover"
            />
          </div>

          <div className="flex flex-col items-start py-2 md:py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-clay">
              {product.category}
            </p>
            <h1 className="mt-3 font-display text-4xl font-medium leading-tight text-forest sm:text-5xl">
              {product.name}
            </h1>

            <div className="mt-5 flex flex-wrap items-baseline gap-3">
              <span className="text-xl font-semibold text-forest">
                {formatPrice(product.price)}
              </span>
              {product.compareAtPrice !== undefined ? (
                <span className="text-base text-muted-foreground line-through">
                  {formatPrice(product.compareAtPrice)}
                </span>
              ) : null}
              {product.badge ? (
                <span className="rounded-sm bg-sage-light px-2.5 py-1 text-xs font-semibold text-forest">
                  {product.badge}
                </span>
              ) : null}
            </div>

            <p className="mt-7 max-w-xl text-base leading-relaxed text-muted-foreground">
              A thoughtful addition to a greener home. Find the size, growing conditions and
              availability below.
            </p>

            <dl className="mt-8 w-full divide-y divide-border border-y border-border">
              <div className="flex flex-wrap justify-between gap-3 py-4">
                <dt className="text-sm font-medium text-muted-foreground">{detailLabel}</dt>
                <dd className="text-right text-sm font-medium text-foreground">{product.light}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-3 py-4">
                <dt className="text-sm font-medium text-muted-foreground">Size</dt>
                <dd className="text-right text-sm font-medium text-foreground">{product.size}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-3 py-4">
                <dt className="text-sm font-medium text-muted-foreground">Availability</dt>
                <dd
                  className={`text-right text-sm font-medium ${product.inStock ? "text-forest" : "text-clay"}`}
                >
                  {product.inStock ? "In stock" : "Sold out"}
                </dd>
              </div>
            </dl>

            {collection ? (
              <Button
                asChild
                className="mt-8 w-full rounded-md bg-forest px-7 py-6 text-sm font-semibold text-cream hover:bg-forest-deep sm:w-auto"
              >
                <Link href={`/collections/${collection.slug}`}>Explore {collection.name}</Link>
              </Button>
            ) : null}
          </div>
        </section>

        {relatedProducts.length > 0 ? (
          <section className="bg-sage-light/50 py-14 sm:py-20">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-clay">
                    From the same collection
                  </p>
                  <h2 className="mt-2 font-display text-3xl font-medium text-forest">
                    You may also like
                  </h2>
                </div>
                {collection ? (
                  <Link
                    href={`/collections/${collection.slug}`}
                    className="text-sm font-semibold text-forest underline-offset-4 transition-colors hover:text-clay hover:underline"
                  >
                    View collection
                  </Link>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
                {relatedProducts.map((related) => (
                  <ProductCard key={related.id} product={related} />
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
