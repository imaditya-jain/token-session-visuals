import { publicOrigin } from "@/server/config/site";
import { duringBuildFallback } from "@/server/blog/safe";
import { latestForFeed } from "@/server/services/blog-public";

export const revalidate = 3600;

const xml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] as string,
  );

/** RSS 2.0 of the latest posts. Excerpts only: the full text stays on the site. */
export async function GET(): Promise<Response> {
  const origin = publicOrigin();
  const posts = await duringBuildFallback(() => latestForFeed(20), []);
  const items = posts
    .map(
      (post) => `    <item>
      <title>${xml(post.title)}</title>
      <link>${origin}/blog/${xml(post.slug)}</link>
      <guid isPermaLink="true">${origin}/blog/${xml(post.slug)}</guid>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
      <description>${xml(post.excerpt)}</description>
${post.categories.map((c) => `      <category>${xml(c.name)}</category>`).join("\n")}
    </item>`,
    )
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>The Fernwood Journal</title>
    <link>${origin}/blog</link>
    <description>Plant care, styling ideas and notes from our growers.</description>
    <language>en</language>
    <atom:link href="${origin}/blog/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
  return new Response(body, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
