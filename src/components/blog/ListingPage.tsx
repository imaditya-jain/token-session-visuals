import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { duringBuildFallback } from "@/server/blog/safe";
import {
  findCategoryBySlug,
  findTagBySlug,
  listLivePosts,
  listPublicCategories,
  type Listing,
  type PublicCategory,
} from "@/server/services/blog-public";

import BlogListing from "./BlogListing";

export type Scope =
  { kind: "all" } | { kind: "category"; slug: string } | { kind: "tag"; slug: string };

/** `/page/2` segments: positive integers only, so nothing odd reaches the database. */
export function parsePage(raw: string | undefined): number | null {
  if (raw === undefined) return 1;
  return /^[1-9]\d{0,3}$/.test(raw) ? Number(raw) : null;
}

const basePathOf = (scope: Scope): string =>
  scope.kind === "all" ? "/blog" : `/blog/${scope.kind}/${scope.slug}`;

type Resolved = {
  title: string;
  eyebrow: string;
  intro: string | undefined;
  listing: Listing;
  categories: PublicCategory[];
};

const EMPTY: Listing = { cards: [], total: 0, pages: 1 };

async function resolve(scope: Scope, page: number): Promise<Resolved | null> {
  return duringBuildFallback<Resolved | null>(
    async () => {
      const categories = await listPublicCategories();
      if (scope.kind === "all") {
        return {
          title: "The Fernwood Journal",
          eyebrow: "Stories, guides and care notes",
          intro: "Plant care, styling ideas and notes from our growers.",
          listing: await listLivePosts({ page }),
          categories,
        };
      }
      if (scope.kind === "category") {
        const category = await findCategoryBySlug(scope.slug);
        if (!category) return null;
        return {
          title: category.name,
          eyebrow: "Category",
          intro: category.description || undefined,
          listing: await listLivePosts({ page, categoryId: String(category._id) }),
          categories,
        };
      }
      const tag = await findTagBySlug(scope.slug);
      if (!tag) return null;
      return {
        title: `#${tag.name}`,
        eyebrow: "Tag",
        intro: undefined,
        listing: await listLivePosts({ page, tagId: String(tag._id) }),
        categories,
      };
    },
    scope.kind === "all"
      ? {
          title: "The Fernwood Journal",
          eyebrow: "Stories, guides and care notes",
          intro: undefined,
          listing: EMPTY,
          categories: [],
        }
      : null,
  );
}

export async function listingMetadata(scope: Scope, rawPage?: string): Promise<Metadata> {
  const page = parsePage(rawPage);
  if (page === null) return {};
  const resolved = await resolve(scope, page);
  if (!resolved) return {};
  const base = basePathOf(scope);
  const path = page === 1 ? base : `${base}/page/${page}`;
  const title = page === 1 ? resolved.title : `${resolved.title} — page ${page}`;
  const description =
    resolved.intro ?? "Plant care, styling ideas and notes from the growers at Fernwood.";
  return {
    title: `${title} — Fernwood`,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} — Fernwood`, description, type: "website", url: path },
    // Pages beyond the first are thin duplicates for search; readers still reach them through the links.
    ...(page > 1 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function ListingPage({ scope, rawPage }: { scope: Scope; rawPage?: string }) {
  const page = parsePage(rawPage);
  if (page === null) notFound();
  const base = basePathOf(scope);
  // `/page/1` is the same page as the base address: one canonical URL.
  if (rawPage === "1") permanentRedirect(base);

  const resolved = await resolve(scope, page);
  if (!resolved) notFound();
  if (page > resolved.listing.pages) notFound();

  return (
    <BlogListing
      eyebrow={resolved.eyebrow}
      title={resolved.title}
      {...(resolved.intro ? { intro: resolved.intro } : {})}
      posts={resolved.listing.cards}
      basePath={base}
      page={page}
      pages={resolved.listing.pages}
      categories={resolved.categories}
      {...(scope.kind === "category" ? { activeCategory: scope.slug } : {})}
    />
  );
}
