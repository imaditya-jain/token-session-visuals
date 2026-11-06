import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import Header from "@/components/storefront/Header";
import ProductCard from "@/components/storefront/ProductCard";
import { Footer } from "@/components/storefront/sections";
import { Button } from "@/components/ui/button";
import {
  collections,
  formatPrice,
  getCollection,
  getProduct,
  products,
} from "@/data/catalog";

export const Route = createFileRoute("/products/$slug")({
  beforeLoad: ({ params }) => {
    if (!getProduct(params.slug)) throw notFound();
  },
  head: ({ params }) => {
    const product = getProduct(params.slug);
    const title = product ? `${product.name} — Fernwood` : "Product — Fernwood";
    const description = product
      ? `${product.name} from Fernwood. Explore product details, availability, and care information.`
      : "Explore plants, pots and tools at Fernwood.";

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const product = getProduct(slug);
  if (!product) throw notFound();

  const collectionSlug = product.collectionSlugs[0];
  const collection = collectionSlug ? getCollection(collectionSlug) : undefined;
  const relatedProducts = collectionSlug
    ? products
        .filter(
          (candidate) =>
            candidate.slug !== product.slug &&
            candidate.collectionSlugs.includes(collectionSlug),
        )
        .slice(0, 4)
    : [];
  const detailLabel =
    product.category === "House Plants" ||
    product.category === "Succulents & Cacti"
      ? "Light"
      : "Details";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-forest">
              Home
            </Link>
            <span aria-hidden="true">/</span>
            {collection ? (
              <>
                <Link
                  to="/collections/$slug"
                  params={{ slug: collection.slug }}
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
            <img
              src={product.image}
              alt={product.name}
              fetchPriority="high"
              width={800}
              height={1000}
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
              A thoughtful addition to a greener home. Find the size, growing
              conditions and availability below.
            </p>

            <dl className="mt-8 w-full divide-y divide-border border-y border-border">
              <div className="flex flex-wrap justify-between gap-3 py-4">
                <dt className="text-sm font-medium text-muted-foreground">
                  {detailLabel}
                </dt>
                <dd className="text-right text-sm font-medium text-foreground">
                  {product.light}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-3 py-4">
                <dt className="text-sm font-medium text-muted-foreground">
                  Size
                </dt>
                <dd className="text-right text-sm font-medium text-foreground">
                  {product.size}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-3 py-4">
                <dt className="text-sm font-medium text-muted-foreground">
                  Availability
                </dt>
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
                <Link
                  to="/collections/$slug"
                  params={{ slug: collection.slug }}
                >
                  Explore {collection.name}
                </Link>
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
                    to="/collections/$slug"
                    params={{ slug: collection.slug }}
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