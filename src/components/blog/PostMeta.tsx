import type { PublicPost } from "@/lib/blog-types";

import { formatDate } from "./format";

/** Author, date and reading time on one line. */
export default function PostMeta({
  post,
  className = "",
}: {
  post: Pick<PublicPost, "authorName" | "publishedAt" | "readingMinutes">;
  className?: string;
}) {
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${className}`}>
      <span>{post.authorName}</span>
      <span aria-hidden>·</span>
      <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
      <span aria-hidden>·</span>
      <span>{post.readingMinutes} min read</span>
    </p>
  );
}
