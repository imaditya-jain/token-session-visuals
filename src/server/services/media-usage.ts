import "server-only";

import type { MediaUsage } from "@/lib/media";
import { pageDef } from "@/lib/page-content";
import { connectDb } from "@/server/db/connection";
import { Post } from "@/server/db/models/blog";
import { Campaign } from "@/server/db/models/campaign";
import { SiteSetting } from "@/server/db/models/site-setting";

/**
 * Where a library picture is used. A picture is "in use" if its address appears in a post (featured image or body),
 * in the website's editable content (header/footer/social and every page), or in a campaign (including sent ones,
 * because those emails still show the picture in people's inboxes). Pictures chosen for a product live in Shopify's
 * own product media and are separate.
 */
type Source = MediaUsage & { text: string };

/** The address without Shopify's `?v=` version, so a replaced picture is still recognised by its old address. */
export const baseOf = (url: string): string => url.split("?")[0] ?? url;

export async function loadSources(): Promise<Source[]> {
  await connectDb();
  const [posts, settings, campaigns] = await Promise.all([
    Post.find({ status: { $ne: "trash" } }, { title: 1, featuredImage: 1, content: 1 }).lean(),
    SiteSetting.find({}, { key: 1, draft: 1, published: 1 }).lean(),
    Campaign.find({}, { name: 1, status: 1, content: 1 }).lean(),
  ]);
  const sources: Source[] = [];
  for (const post of posts) {
    sources.push({
      type: "post",
      label: post.title || "Untitled post",
      href: `/admin/posts/${String(post._id)}`,
      text: `${post.featuredImage?.url ?? ""} ${JSON.stringify(post.content ?? null)}`,
    });
  }
  for (const setting of settings) {
    if (setting.key === "chrome") {
      sources.push({
        type: "site",
        label: "Header, footer and social links",
        href: "/admin/site/header",
        text: JSON.stringify([setting.draft ?? null, setting.published ?? null]),
      });
    } else if (setting.key.startsWith("page:")) {
      const id = setting.key.slice(5);
      sources.push({
        type: "page",
        label: `Page: ${pageDef(id)?.title ?? id}`,
        href: `/admin/site/pages/${id}`,
        text: JSON.stringify([setting.draft ?? null, setting.published ?? null]),
      });
    }
  }
  for (const campaign of campaigns) {
    sources.push({
      type: "campaign",
      label: `Campaign: ${campaign.name}${campaign.status === "sent" ? " (sent)" : ""}`,
      href: `/admin/marketing/campaigns/${String(campaign._id)}`,
      text: JSON.stringify(campaign.content ?? null),
    });
  }
  return sources;
}

/** Usage of many pictures with one pass over the content. */
export function usageIn(sources: Source[], urls: string[]): Map<string, MediaUsage[]> {
  const result = new Map<string, MediaUsage[]>();
  for (const url of urls) {
    const base = baseOf(url);
    result.set(
      url,
      sources
        .filter((source) => source.text.includes(base))
        .map(({ type, label, href }) => ({ type, label, href })),
    );
  }
  return result;
}

export async function usageOf(urls: string[]): Promise<Map<string, MediaUsage[]>> {
  return usageIn(await loadSources(), urls);
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Points every reference to a replaced picture at its new address. Sent campaigns are records and stay as they were. */
export async function rewriteReferences(oldUrl: string, newUrl: string): Promise<number> {
  await connectDb();
  const base = baseOf(oldUrl);
  if (!base || oldUrl === newUrl) return 0;
  const plain = new RegExp(`${escapeRegex(base)}(\\?v=\\d+)?`, "g");
  const encoded = new RegExp(`${escapeRegex(encodeURIComponent(base))}(%3Fv%3D\\d+)?`, "g");
  const swap = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value).replace(plain, () => newUrl)) as T;
  let changed = 0;

  const posts = await Post.find(
    {
      $or: [
        { "featuredImage.url": { $regex: `^${escapeRegex(base)}` } },
        { contentHtml: { $regex: escapeRegex(encodeURIComponent(base)) } },
      ],
    },
    { featuredImage: 1, content: 1, contentHtml: 1 },
  ).lean();
  for (const post of posts) {
    await Post.updateOne(
      { _id: post._id },
      {
        $set: {
          ...(post.featuredImage ? { featuredImage: swap(post.featuredImage) } : {}),
          content: swap(post.content),
          contentHtml: post.contentHtml.replace(encoded, () => encodeURIComponent(newUrl)),
        },
      },
    );
    changed++;
  }
  const settings = await SiteSetting.find({ key: { $in: ["chrome"] } }).lean();
  const pages = await SiteSetting.find({ key: /^page:/ }).lean();
  for (const setting of [...settings, ...pages]) {
    if (!JSON.stringify([setting.draft, setting.published]).includes(base)) continue;
    await SiteSetting.updateOne(
      { _id: setting._id },
      {
        $set: {
          draft: swap(setting.draft),
          ...(setting.published ? { published: swap(setting.published) } : {}),
        },
      },
    );
    changed++;
  }
  const campaigns = await Campaign.find(
    { status: { $in: ["draft", "scheduled"] } },
    { content: 1 },
  ).lean();
  for (const campaign of campaigns) {
    if (!JSON.stringify(campaign.content).includes(base)) continue;
    await Campaign.updateOne({ _id: campaign._id }, { $set: { content: swap(campaign.content) } });
    changed++;
  }
  return changed;
}
