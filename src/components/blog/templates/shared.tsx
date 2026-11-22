import Link from "next/link";

import type { TermView } from "@/lib/blog-types";

export function CategoryLinks({
  categories,
  className = "",
}: {
  categories: TermView[];
  className?: string;
}) {
  if (categories.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-x-3 gap-y-1 ${className}`} aria-label="Categories">
      {categories.map((category) => (
        <li key={category.id}>
          <Link
            href={`/blog/category/${category.slug}`}
            className="text-xs font-semibold uppercase tracking-wider hover:underline"
          >
            {category.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function TagList({ tags }: { tags: TermView[] }) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="Tags" className="mt-10 flex flex-wrap gap-2 border-t border-border pt-6">
      {tags.map((tag) => (
        <li key={tag.id}>
          <Link
            href={`/blog/tag/${tag.slug}`}
            className="inline-flex min-h-11 items-center rounded-full bg-muted px-4 text-sm text-forest hover:bg-sage-light"
          >
            #{tag.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
