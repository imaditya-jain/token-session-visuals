import JsonLd from "@/components/seo/JsonLd";
import { store } from "@/data/store-info";
import { productJsonLd } from "@/lib/structured-data";
import { publicOrigin } from "@/server/config/site";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Leaf, PackageCheck, Ruler, ShieldCheck, Sun, Truck } from "lucide-react";

import WishlistButton from "@/components/storefront/WishlistButton";
import ProductBuyButton from "@/components/storefront/ProductBuyButton";
import Header from "@/components/storefront/Header";
import ProductCard from "@/components/storefront/ProductCard";
import { Footer, WaveTop } from "@/components/storefront/sections";
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

        <section className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 md:grid-cols-2 md:gap-14 lg:px-8 lg:py-14">
          <div className="md:sticky md:top-28 md:self-start">
            <div className="relative overflow-hidden rounded-[2rem] bg-sand shadow-xl ring-1 ring-border/60">
              <Image
                src={product.image}
                alt={product.name}
                priority
                width={800}
                height={1000}
                sizes="(min-width: 1280px) 600px, (min-width: 768px) 50vw, 100vw"
                className="aspect-[4/5] w-full object-cover"
              />
              {product.badge ? (
                <span className="absolute left-5 top-5 rounded-full bg-forest px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-cream shadow-md">
                  {product.badge}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col items-start md:py-6">
            <p className="inline-flex rounded-full bg-sage-light px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-forest">
              {product.category}
            </p>
            <h1 className="mt-4 font-display text-4xl font-medium leading-[1.05] tracking-tight text-forest sm:text-5xl lg:text-6xl">
              {product.name}
            </h1>

            <div className="mt-6 flex flex-wrap items-baseline gap-3">
              <span className="font-display text-4xl font-medium text-forest">
                {formatPrice(product.price)}
              </span>
              {product.compareAtPrice !== undefined ? (
                <>
                  <span className="text-lg text-muted-foreground line-through">
                    {formatPrice(product.compareAtPrice)}
                  </span>
                  <span className="rounded-full bg-clay px-3 py-1 text-xs font-semibold uppercase tracking-wider text-cream">
                    Sale
                  </span>
                </>
              ) : null}
            </div>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
              A thoughtful addition to a greener home. Find the size, growing conditions and
              availability below.
            </p>

            <dl className="mt-8 grid w-full gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/60">
                <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Sun className="size-4 text-clay" aria-hidden />
                  {detailLabel}
                </dt>
                <dd className="mt-2 text-sm font-medium text-foreground">{product.light}</dd>
              </div>
              <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/60">
                <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Ruler className="size-4 text-clay" aria-hidden />
                  Size
                </dt>
                <dd className="mt-2 text-sm font-medium text-foreground">{product.size}</dd>
              </div>
              <div className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border/60">
                <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <PackageCheck className="size-4 text-clay" aria-hidden />
                  Availability
                </dt>
                <dd
                  className={`mt-2 text-sm font-medium ${product.inStock ? "text-forest" : "text-clay"}`}
                >
                  {product.inStock ? "In stock" : "Sold out"}
                </dd>
              </div>
            </dl>

            <div className="mt-8 flex w-full items-center gap-3">
              <div className="flex-1">
                <ProductBuyButton
                  name={product.name}
                  variantId={product.variantId}
                  inStock={product.inStock}
                />
              </div>
              <WishlistButton
                handle={product.slug}
                name={product.name}
                className="size-14 shrink-0 bg-card ring-1 ring-border/60"
              />
            </div>

            <ul className="mt-6 grid w-full gap-3 text-sm text-foreground/85 sm:grid-cols-3">
              {[
                { icon: Truck, text: "Free shipping over $75" },
                { icon: ShieldCheck, text: "30-day guarantee" },
                { icon: Leaf, text: "Plastic-free packing" },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2">
                  <Icon className="size-4 shrink-0 text-forest" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>

            {collection ? (
              <Link
                href={`/collections/${collection.slug}`}
                className="mt-8 text-sm font-semibold text-forest underline-offset-4 transition-colors hover:text-clay hover:underline"
              >
                Explore {collection.name} →
              </Link>
            ) : null}
          </div>
        </section>

        {relatedProducts.length > 0 ? (
          <section className="relative bg-sage-light/50 pb-14 pt-20 sm:pb-20 sm:pt-28">
            <WaveTop className="text-background" />
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
