import type { PublicPostCard } from "@/lib/blog-types";

import PostCard from "./PostCard";

/** "More to read" under a post. Renders nothing when there is nothing to recommend. */
export default function RelatedPosts({ posts }: { posts: PublicPostCard[] }) {
  if (posts.length === 0) return null;
  return (
    <section
      aria-labelledby="related-heading"
      className="mx-auto mt-16 max-w-7xl px-4 sm:px-6 lg:px-8"
    >
      <h2 id="related-heading" className="mb-6 font-display text-2xl font-medium text-forest">
        More to read
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
