import Link from "next/link";

import ProductCard from "@/components/storefront/ProductCard";

import PostBody from "../PostBody";
import PostImage from "../PostImage";
import PostMeta from "../PostMeta";
import RelatedPosts from "../RelatedPosts";
import { CategoryLinks, TagList } from "./shared";
import type { TemplateProps } from "./types";

/** Guide: a table of contents built from the headings, and plants to try at the end. */
export default function GuideTemplate({ post, related, products }: TemplateProps) {
  const toc = post.headings.filter((heading) => heading.level <= 3 && heading.text);
  const contents = (
    <ol className="space-y-1">
      {toc.map((heading) => (
        <li key={heading.id} className={heading.level === 3 ? "pl-4" : ""}>
          <a
            href={`#${heading.id}`}
            className="flex min-h-11 items-center text-sm text-forest hover:text-clay"
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <article data-template="guide">
      <header className="mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6 sm:pt-16 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-clay">Care guide</p>
        <h1 className="mt-3 max-w-4xl font-display text-4xl font-medium leading-tight text-forest sm:text-5xl">
          {post.title}
        </h1>
        {post.excerpt ? (
          <p className="mt-4 max-w-3xl text-lg text-muted-foreground">{post.excerpt}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
          <PostMeta post={post} className="text-muted-foreground" />
          <CategoryLinks categories={post.categories} className="text-clay" />
        </div>
      </header>
      {post.featuredImage ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <PostImage
            image={post.featuredImage}
            title={post.title}
            priority
            aspect="aspect-[2/1]"
            sizes="(min-width: 1280px) 1216px, 100vw"
            className="rounded-2xl shadow-xl"
          />
        </div>
      ) : null}

      <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-10 sm:px-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:px-8">
        {toc.length > 0 ? (
          <nav aria-label="Table of contents" className="lg:sticky lg:top-24 lg:self-start">
            <div className="hidden rounded-xl bg-card p-5 ring-1 ring-border/60 lg:block">
              <p className="mb-2 font-display text-lg text-forest">In this guide</p>
              {contents}
            </div>
            <details className="rounded-xl bg-card p-4 ring-1 ring-border/60 lg:hidden">
              <summary className="flex min-h-11 cursor-pointer items-center font-display text-lg text-forest">
                In this guide
              </summary>
              <div className="mt-2">{contents}</div>
            </details>
          </nav>
        ) : (
          <div className="hidden lg:block" />
        )}
        <div className="max-w-3xl">
          <PostBody html={post.html} />
          <TagList tags={post.tags} />
        </div>
      </div>

      {products.length > 0 ? (
        <section
          aria-labelledby="try-heading"
          className="mx-auto mt-16 max-w-7xl px-4 sm:px-6 lg:px-8"
        >
          <div className="mb-6 flex items-baseline justify-between">
            <h2 id="try-heading" className="font-display text-2xl font-medium text-forest">
              Plants to try
            </h2>
            <Link
              href="/shop"
              className="text-sm font-medium text-forest underline-offset-4 hover:text-clay hover:underline"
            >
              Shop all
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.slug} product={product} />
            ))}
          </div>
        </section>
      ) : null}
      <RelatedPosts posts={related} />
      <div className="pb-16" />
    </article>
  );
}
