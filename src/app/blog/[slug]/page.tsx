import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import BlogFrame from "@/components/blog/BlogFrame";
import PostTemplate from "@/components/blog/templates/PostTemplate";
import JsonLd from "@/components/seo/JsonLd";
import { getBestSellers } from "@/data/catalog";
import { autoExcerpt } from "@/lib/rich-text";
import { blogPostingJsonLd, breadcrumbJsonLd } from "@/lib/structured-data";
import { duringBuildFallback } from "@/server/blog/safe";
import { publicOrigin } from "@/server/config/site";
import {
  findPostBySlug,
  listLiveSlugs,
  listPublicCategories,
  relatedPosts,
} from "@/server/services/blog-public";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

/** One lookup per render, shared by the metadata and the page. An old address redirects permanently to the new one. */
const loadPost = cache(async (slug: string) => {
  const found = await findPostBySlug(slug);
  if (!found) notFound();
  if (found.kind === "redirect") permanentRedirect(`/blog/${found.slug}`);
  return found.post;
});

export async function generateStaticParams() {
  const slugs = await duringBuildFallback(() => listLiveSlugs(), []);
  return slugs.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await loadPost((await params).slug);
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || autoExcerpt(post.title, 160);
  const image = post.featuredImage;
  return {
    title: `${title} — Fernwood`,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title,
      description,
      url: `/blog/${post.slug}`,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.authorName],
      ...(image ? { images: [{ url: image.url, alt: image.alt || post.title }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image.url] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const post = await loadPost((await params).slug);
  const origin = publicOrigin();
  const [related, categories, products] = await Promise.all([
    relatedPosts(post, 3),
    listPublicCategories(),
    // Only the guide layout shows products; the others don't pay for the lookup.
    post.template === "guide"
      ? getBestSellers().then((all) => all.slice(0, 4))
      : Promise.resolve([]),
  ]);
  const firstCategory = post.categories[0];

  return (
    <BlogFrame>
      <JsonLd
        data={blogPostingJsonLd(origin, {
          title: post.title,
          slug: post.slug,
          description: post.seoDescription || post.excerpt,
          publishedAt: post.publishedAt,
          updatedAt: post.updatedAt,
          authorName: post.authorName,
          image: post.featuredImage?.url ?? null,
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd(origin, [
          { name: "Home", path: "/" },
          { name: "Journal", path: "/blog" },
          ...(firstCategory
            ? [{ name: firstCategory.name, path: `/blog/category/${firstCategory.slug}` }]
            : []),
          { name: post.title, path: `/blog/${post.slug}` },
        ])}
      />
      <PostTemplate post={post} related={related} categories={categories} products={products} />
    </BlogFrame>
  );
}
