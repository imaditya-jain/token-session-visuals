import type { Product } from "@/lib/types";

/** Resolves a site-relative or absolute image URL against the public origin. */
export const absoluteUrl = (origin: string, path: string): string =>
  /^https?:\/\//.test(path) ? path : `${origin}${path.startsWith("/") ? "" : "/"}${path}`;

export function productJsonLd(product: Product, origin: string, currency: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    ...(product.image ? { image: [absoluteUrl(origin, product.image)] } : {}),
    category: product.category,
    url: `${origin}/products/${product.slug}`,
    brand: { "@type": "Brand", name: "Fernwood" },
    offers: {
      "@type": "Offer",
      url: `${origin}/products/${product.slug}`,
      priceCurrency: currency,
      price: product.price.toFixed(2),
      availability: product.inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
}

export function organizationJsonLd(
  origin: string,
  input: { name: string; email: string; logo: string },
) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: input.name,
    url: origin,
    logo: absoluteUrl(origin, input.logo),
    email: input.email,
  };
}

/** Lets search engines show a site-search box that goes straight to our `/search` page. */
export function websiteJsonLd(origin: string, name: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: origin,
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(origin: string, trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(origin, item.path),
    })),
  };
}

export function blogPostingJsonLd(
  origin: string,
  post: {
    title: string;
    slug: string;
    description: string;
    publishedAt: string;
    updatedAt: string;
    authorName: string;
    image: string | null;
  },
) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url: `${origin}/blog/${post.slug}`,
    mainEntityOfPage: `${origin}/blog/${post.slug}`,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { "@type": "Person", name: post.authorName },
    publisher: { "@type": "Organization", name: "Fernwood", url: origin },
    ...(post.image ? { image: [post.image] } : {}),
  };
}
