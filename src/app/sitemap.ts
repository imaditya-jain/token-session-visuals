import type { MetadataRoute } from "next";

import { getCollections, getProducts } from "@/data/catalog";
import { POLICY_SLUGS } from "@/lib/policies";
import { duringBuildFallback } from "@/server/blog/safe";
import { publicOrigin } from "@/server/config/site";
import { listLiveSlugs, listPublicCategories, listPublicTags } from "@/server/services/blog-public";
import { getPolicy } from "@/server/services/policies";

/** Rebuilt hourly, like the catalog pages it lists. */
export const revalidate = 3600;

const STATIC_PATHS = [
  "/",
  "/shop",
  "/collections",
  "/plant-finder",
  "/about",
  "/care-guide",
  "/faq",
  "/contact",
  "/gift-cards",
  "/careers",
  "/wholesale",
  "/gardener-services",
  "/sustainability",
  "/press",
  "/accessibility",
  "/shipping-delivery",
  "/plant-guarantee",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicOrigin();
  const [collections, products, policies, blog] = await Promise.all([
    getCollections(),
    getProducts(),
    // Only policies the merchant has actually written are indexable (the others render a noindex notice).
    Promise.all(POLICY_SLUGS.map(async (slug) => ((await getPolicy(slug)) ? slug : null))),
    duringBuildFallback(
      async () => ({
        posts: await listLiveSlugs(),
        categories: await listPublicCategories(),
        tags: await listPublicTags(),
      }),
      { posts: [], categories: [], tags: [] },
    ),
  ]);

  const paths = [
    ...STATIC_PATHS,
    ...collections.map((collection) => `/collections/${collection.slug}`),
    ...products.map((product) => `/products/${product.slug}`),
    ...policies
      .filter((slug): slug is (typeof POLICY_SLUGS)[number] => slug !== null)
      .map((slug) => `/policies/${slug}`),
  ];
  const pages = paths.map((path) => ({ url: `${origin}${path === "/" ? "" : path}` }));
  // The journal appears only once it has something to show.
  const journal =
    blog.posts.length === 0
      ? []
      : [
          { url: `${origin}/blog` },
          ...blog.posts.map((post) => ({
            url: `${origin}/blog/${post.slug}`,
            lastModified: post.updatedAt,
          })),
          ...blog.categories.map((category) => ({
            url: `${origin}/blog/category/${category.slug}`,
          })),
          ...blog.tags.map((tag) => ({ url: `${origin}/blog/tag/${tag.slug}` })),
        ];
  return [...pages, ...journal];
}
