import PostBody from "../PostBody";
import PostImage from "../PostImage";
import PostMeta from "../PostMeta";
import RelatedPosts from "../RelatedPosts";
import { CategoryLinks, TagList } from "./shared";
import type { TemplateProps } from "./types";

/** Visual: the image comes first, full width, with the headline over it. Photos in the text run wider. */
export default function VisualTemplate({ post, related }: TemplateProps) {
  return (
    <article data-template="visual">
      <header className="relative isolate flex min-h-[70vh] items-end overflow-hidden bg-forest-deep">
        {post.featuredImage ? (
          <PostImage
            image={post.featuredImage}
            title={post.title}
            priority
            aspect=""
            className="absolute inset-0 -z-10 h-full"
            sizes="100vw"
          />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-deep/90 via-forest-deep/30 to-transparent" />
        <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-32 text-cream sm:px-6 sm:pb-16">
          <CategoryLinks categories={post.categories} className="text-sage-light" />
          <h1 className="mt-4 font-display text-4xl font-medium leading-tight sm:text-6xl">
            {post.title}
          </h1>
          <PostMeta post={post} className="mt-5 text-cream/80" />
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 pt-12">
        <PostBody html={post.html} className="[&_figure]:sm:-mx-16 [&_figure]:lg:-mx-28" />
        <TagList tags={post.tags} />
      </div>
      <RelatedPosts posts={related} />
      <div className="pb-16" />
    </article>
  );
}
