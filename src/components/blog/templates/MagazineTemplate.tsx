import Link from "next/link";

import { formatDate } from "../format";
import PostBody from "../PostBody";
import PostImage from "../PostImage";
import RelatedPosts from "../RelatedPosts";
import { CategoryLinks, TagList } from "./shared";
import type { TemplateProps } from "./types";

/** Magazine: a wide hero, then the text beside a side panel with categories, tags and more reading. */
export default function MagazineTemplate({ post, related, categories }: TemplateProps) {
  const more = related.slice(0, 3);
  return (
    <article data-template="magazine">
      <header className="mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6 sm:pt-16 lg:px-8">
        <CategoryLinks categories={post.categories} className="text-clay" />
        <h1 className="mt-3 max-w-4xl font-display text-4xl font-medium leading-tight text-forest sm:text-6xl">
          {post.title}
        </h1>
        {post.excerpt ? (
          <p className="mt-4 max-w-3xl text-lg text-muted-foreground">{post.excerpt}</p>
        ) : null}
      </header>
      {post.featuredImage ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <PostImage
            image={post.featuredImage}
            title={post.title}
            priority
            aspect="aspect-[21/9]"
            sizes="(min-width: 1280px) 1216px, 100vw"
            className="rounded-2xl shadow-xl"
          />
        </div>
      ) : null}
      <div className="mx-auto grid max-w-7xl gap-12 px-4 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-8">
        <div className="max-w-3xl">
          <PostBody html={post.html} />
          <TagList tags={post.tags} />
        </div>
        <aside aria-label="About this post" className="space-y-8 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl bg-card p-5 ring-1 ring-border/60">
            <p className="font-display text-lg text-forest">{post.authorName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time> ·{" "}
              {post.readingMinutes} min read
            </p>
          </div>
          {categories.length > 0 ? (
            <nav
              aria-label="Browse categories"
              className="rounded-xl bg-card p-5 ring-1 ring-border/60"
            >
              <h2 className="mb-3 font-display text-lg text-forest">Browse</h2>
              <ul className="space-y-1">
                {categories.map((category) => (
                  <li key={category.id}>
                    <Link
                      href={`/blog/category/${category.slug}`}
                      className="flex min-h-11 items-center justify-between text-sm text-forest hover:text-clay"
                    >
                      {category.name}
                      <span className="text-muted-foreground">{category.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {more.length > 0 ? (
            <section
              aria-labelledby="side-more"
              className="rounded-xl bg-card p-5 ring-1 ring-border/60"
            >
              <h2 id="side-more" className="mb-3 font-display text-lg text-forest">
                Keep reading
              </h2>
              <ul className="space-y-3">
                {more.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/blog/${item.slug}`}
                      className="text-sm font-medium text-forest hover:text-clay"
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
      <RelatedPosts posts={related} />
      <div className="pb-16" />
    </article>
  );
}
