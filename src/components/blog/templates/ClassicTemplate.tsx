import PostBody from "../PostBody";
import PostImage from "../PostImage";
import PostMeta from "../PostMeta";
import RelatedPosts from "../RelatedPosts";
import { CategoryLinks, TagList } from "./shared";
import type { TemplateProps } from "./types";

/** Classic: a centred column under a wide hero image. */
export default function ClassicTemplate({ post, related }: TemplateProps) {
  return (
    <article data-template="classic">
      <header className="mx-auto max-w-3xl px-4 pb-8 pt-14 text-center sm:pt-20">
        <CategoryLinks categories={post.categories} className="justify-center text-clay" />
        <h1 className="mt-4 font-display text-4xl font-medium leading-tight text-forest sm:text-5xl">
          {post.title}
        </h1>
        <PostMeta post={post} className="mt-5 justify-center text-muted-foreground" />
      </header>
      {post.featuredImage ? (
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <PostImage
            image={post.featuredImage}
            title={post.title}
            priority
            sizes="(min-width: 1024px) 1024px, 100vw"
            className="rounded-2xl shadow-xl"
          />
        </div>
      ) : null}
      <div className="mx-auto max-w-2xl px-4 pt-10">
        <PostBody html={post.html} />
        <TagList tags={post.tags} />
      </div>
      <RelatedPosts posts={related} />
      <div className="pb-16" />
    </article>
  );
}
