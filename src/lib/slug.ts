/** URL slug: lowercase ASCII words joined by hyphens ("Café au Lait!" → "cafe-au-lait"). */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Words that are blog routes (`/blog/page/2`, `/blog/category/…`, `/blog/tag/…`, `/blog/feed.xml`): a post can't use them. */
export const RESERVED_POST_SLUGS: readonly string[] = [
  "page",
  "category",
  "tag",
  "feed",
  "feed-xml",
];
