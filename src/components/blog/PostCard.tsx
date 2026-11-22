import Link from "next/link";

import type { PublicPostCard } from "@/lib/blog-types";

import { formatDate } from "./format";
import PostImage from "./PostImage";

/** A post in a listing. The title is an h3: listings put a visually-hidden h2 before the grid. */
export default function PostCard({ post }: { post: PublicPostCard }) {
  const category = post.categories[0];
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <Link
        href={`/blog/${post.slug}`}
        aria-hidden
        tabIndex={-1}
        className="block overflow-hidden bg-sand"
      >
        {post.featuredImage ? (
          <PostImage
            image={post.featuredImage}
            title={post.title}
            aspect="aspect-[3/2]"
            sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
            className="transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex aspect-[3/2] items-center justify-center font-display text-2xl text-forest/40">
            Fernwood
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        {category ? (
          <Link
            href={`/blog/category/${category.slug}`}
            className="text-xs font-semibold uppercase tracking-wider text-clay hover:underline"
          >
            {category.name}
          </Link>
        ) : null}
        <h3 className="mt-2 font-display text-xl font-medium leading-snug text-forest">
          <Link href={`/blog/${post.slug}`} className="hover:text-clay">
            {post.title}
          </Link>
        </h3>
        {post.excerpt ? (
          <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{post.excerpt}</p>
        ) : null}
        <p className="mt-auto pt-4 text-xs text-muted-foreground">
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time> ·{" "}
          {post.readingMinutes} min read
        </p>
      </div>
    </article>
  );
}
