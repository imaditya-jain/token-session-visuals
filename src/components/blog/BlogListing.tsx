import Link from "next/link";

import type { PublicCategory } from "@/server/services/blog-public";
import type { PublicPostCard } from "@/lib/blog-types";

import BlogFrame from "./BlogFrame";
import BlogPagination from "./BlogPagination";
import PostCard from "./PostCard";

/** The journal index, and its category and tag views: heading, category links, a grid and paging. */
export default function BlogListing({
  eyebrow,
  title,
  intro,
  posts,
  basePath,
  page,
  pages,
  categories,
  activeCategory,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  posts: PublicPostCard[];
  basePath: string;
  page: number;
  pages: number;
  categories: PublicCategory[];
  activeCategory?: string;
}) {
  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition-colors ${
      active ? "bg-forest text-cream" : "bg-card text-forest ring-1 ring-border/60 hover:bg-muted"
    }`;
  return (
    <BlogFrame>
      <header className="bg-forest-deep px-4 py-16 text-center text-cream sm:py-20">
        <p className="text-sm uppercase tracking-[0.2em] text-cream/75">{eyebrow}</p>
        <h1 className="mt-3 font-display text-4xl font-medium sm:text-6xl">{title}</h1>
        {intro ? <p className="mx-auto mt-4 max-w-2xl text-cream/85">{intro}</p> : null}
      </header>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        {categories.length > 0 ? (
          <nav
            aria-label="Journal categories"
            className="mb-10 flex flex-wrap justify-center gap-2"
          >
            <Link
              href="/blog"
              className={chip(activeCategory === undefined && basePath === "/blog")}
            >
              All
            </Link>
            {categories.map((category) => (
              <Link
                key={category.id}
                href={`/blog/category/${category.slug}`}
                aria-current={activeCategory === category.slug ? "page" : undefined}
                className={chip(activeCategory === category.slug)}
              >
                {category.name}
              </Link>
            ))}
          </nav>
        ) : null}

        {posts.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            Nothing has been published here yet.
          </p>
        ) : (
          <section aria-labelledby="posts-heading">
            <h2 id="posts-heading" className="sr-only">
              Posts
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
            <BlogPagination basePath={basePath} page={page} pages={pages} />
          </section>
        )}
      </div>
    </BlogFrame>
  );
}
