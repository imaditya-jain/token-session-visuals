import PostBody from "../PostBody";
import PostImage from "../PostImage";
import PostMeta from "../PostMeta";
import RelatedPosts from "../RelatedPosts";
import { CategoryLinks, TagList } from "./shared";
import type { TemplateProps } from "./types";

/** Editorial: a large serif headline on a coloured band, then a narrow, generous reading column. */
export default function EditorialTemplate({ post, related }: TemplateProps) {
  return (
    <article data-template="editorial">
      <header className="bg-forest-deep px-4 pb-24 pt-16 text-cream sm:pb-32 sm:pt-24">
        <div className="mx-auto max-w-4xl">
          <CategoryLinks categories={post.categories} className="text-sage-light" />
          <h1 className="mt-5 font-display text-5xl font-medium leading-[1.05] sm:text-7xl">
            {post.title}
          </h1>
          {post.excerpt ? (
            <p className="mt-6 max-w-2xl font-display text-xl italic text-cream/85 sm:text-2xl">
              {post.excerpt}
            </p>
          ) : null}
          <PostMeta post={post} className="mt-8 text-cream/75" />
        </div>
      </header>
      {post.featuredImage ? (
        <div className="mx-auto -mt-16 max-w-5xl px-4 sm:-mt-24 sm:px-6">
          <PostImage
            image={post.featuredImage}
            title={post.title}
            priority
            aspect="aspect-[3/2]"
            sizes="(min-width: 1024px) 1024px, 100vw"
            className="rounded-2xl shadow-2xl"
          />
        </div>
      ) : null}
      <div className="mx-auto max-w-xl px-4 pt-12 text-lg">
        <PostBody
          html={post.html}
          className="[&>p:first-of-type]:first-letter:float-left [&>p:first-of-type]:first-letter:mr-3 [&>p:first-of-type]:first-letter:font-display [&>p:first-of-type]:first-letter:text-6xl [&>p:first-of-type]:first-letter:leading-[0.85] [&>p:first-of-type]:first-letter:text-forest"
        />
        <TagList tags={post.tags} />
      </div>
      <RelatedPosts posts={related} />
      <div className="pb-16" />
    </article>
  );
}
