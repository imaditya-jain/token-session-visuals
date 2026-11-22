import "server-only";

import { Types } from "mongoose";

import type { PostStatus, PublicPost, PublicPostCard, TermView } from "@/lib/blog-types";
import { connectDb } from "@/server/db/connection";
import {
  Category,
  Post,
  Tag,
  type CategoryRecord,
  type PostRecord,
  type TagRecord,
} from "@/server/db/models/blog";
import { User } from "@/server/db/models/user";

/**
 * Posts visible to the public at `now`: published, or scheduled and already due. Deciding by time (not only by the
 * stored status) means a scheduled post goes live on schedule even though the sweeper that flips its status runs
 * rarely; pages pick it up on their next regeneration.
 */
const LIVE_STATUSES: PostStatus[] = ["published", "scheduled"];
const live = (now: Date) => ({
  status: { $in: LIVE_STATUSES },
  publishedAt: { $lte: now },
});

const CARD_FIELDS = {
  title: 1,
  slug: 1,
  excerpt: 1,
  summary: 1,
  featuredImage: 1,
  publishedAt: 1,
  authorId: 1,
  readingMinutes: 1,
  categoryIds: 1,
} as const;

async function lookups(rows: Pick<PostRecord, "authorId" | "categoryIds" | "tagIds">[]) {
  const authorIds = [...new Set(rows.map((r) => String(r.authorId)))];
  const categoryIds = [...new Set(rows.flatMap((r) => r.categoryIds.map(String)))];
  const tagIds = [...new Set(rows.flatMap((r) => (r.tagIds ?? []).map(String)))];
  const [users, categories, tags] = await Promise.all([
    User.find({ _id: { $in: authorIds } }, { firstName: 1, lastName: 1 }).lean(),
    Category.find({ _id: { $in: categoryIds } }, { name: 1, slug: 1 }).lean(),
    Tag.find({ _id: { $in: tagIds } }, { name: 1, slug: 1 }).lean(),
  ]);
  const term = (t: { _id: Types.ObjectId; name: string; slug: string }): TermView => ({
    id: String(t._id),
    name: t.name,
    slug: t.slug,
  });
  return {
    author: new Map(users.map((u) => [String(u._id), `${u.firstName} ${u.lastName}`])),
    categories: new Map(categories.map((c) => [String(c._id), term(c)])),
    tags: new Map(tags.map((t) => [String(t._id), term(t)])),
  };
}

type CardRow = Pick<
  PostRecord,
  | "_id"
  | "title"
  | "slug"
  | "excerpt"
  | "summary"
  | "featuredImage"
  | "publishedAt"
  | "authorId"
  | "readingMinutes"
  | "categoryIds"
>;

const toCards = async (rows: CardRow[]): Promise<PublicPostCard[]> => {
  const maps = await lookups(rows.map((r) => ({ ...r, tagIds: [] })));
  return rows.map((row) => ({
    id: String(row._id),
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt || row.summary,
    featuredImage: row.featuredImage ?? null,
    publishedAt: (row.publishedAt as Date).toISOString(),
    authorName: maps.author.get(String(row.authorId)) ?? "Fernwood",
    readingMinutes: row.readingMinutes,
    categories: row.categoryIds.flatMap((id) => maps.categories.get(String(id)) ?? []),
  }));
};

export type PostLookup =
  { kind: "post"; post: PublicPost } | { kind: "redirect"; slug: string } | null;

/** A live post by slug; an old slug answers with the current one so the page can redirect permanently. */
export async function findPostBySlug(slug: string, now = new Date()): Promise<PostLookup> {
  await connectDb();
  const current = await Post.findOne({ slug, ...live(now) }).lean();
  if (current) return { kind: "post", post: await toPublicPost(current) };
  const moved = await Post.findOne({ previousSlugs: slug, ...live(now) }, { slug: 1 }).lean();
  return moved ? { kind: "redirect", slug: moved.slug } : null;
}

async function toPublicPost(row: PostRecord): Promise<PublicPost> {
  const maps = await lookups([row]);
  return {
    id: String(row._id),
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt || row.summary,
    html: row.contentHtml,
    headings: row.headings,
    featuredImage: row.featuredImage ?? null,
    publishedAt: (row.publishedAt as Date).toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    authorName: maps.author.get(String(row.authorId)) ?? "Fernwood",
    categories: row.categoryIds.flatMap((id) => maps.categories.get(String(id)) ?? []),
    tags: row.tagIds.flatMap((id) => maps.tags.get(String(id)) ?? []),
    template: row.template,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    readingMinutes: row.readingMinutes,
  };
}

export const BLOG_PAGE_SIZE = 9;

export type Listing = { cards: PublicPostCard[]; total: number; pages: number };

export async function listLivePosts(options: {
  page: number;
  categoryId?: string;
  tagId?: string;
  pageSize?: number;
  now?: Date;
}): Promise<Listing> {
  await connectDb();
  const size = options.pageSize ?? BLOG_PAGE_SIZE;
  const filter = {
    ...live(options.now ?? new Date()),
    ...(options.categoryId ? { categoryIds: new Types.ObjectId(options.categoryId) } : {}),
    ...(options.tagId ? { tagIds: new Types.ObjectId(options.tagId) } : {}),
  };
  const [rows, total] = await Promise.all([
    Post.find(filter, CARD_FIELDS)
      .sort({ publishedAt: -1, _id: -1 })
      .skip((options.page - 1) * size)
      .limit(size)
      .lean(),
    Post.countDocuments(filter),
  ]);
  return { cards: await toCards(rows), total, pages: Math.max(1, Math.ceil(total / size)) };
}

/** More to read: posts sharing a category first, topped up with the newest. Never includes the post itself. */
export async function relatedPosts(
  post: Pick<PublicPost, "id" | "categories">,
  limit = 3,
  now = new Date(),
): Promise<PublicPostCard[]> {
  await connectDb();
  const self = new Types.ObjectId(post.id);
  const categoryIds = post.categories.map((c) => new Types.ObjectId(c.id));
  const same = categoryIds.length
    ? await Post.find(
        { ...live(now), _id: { $ne: self }, categoryIds: { $in: categoryIds } },
        CARD_FIELDS,
      )
        .sort({ publishedAt: -1 })
        .limit(limit)
        .lean()
    : [];
  let rows = same;
  if (rows.length < limit) {
    const have = [self, ...rows.map((r) => r._id)];
    const more = await Post.find({ ...live(now), _id: { $nin: have } }, CARD_FIELDS)
      .sort({ publishedAt: -1 })
      .limit(limit - rows.length)
      .lean();
    rows = [...rows, ...more];
  }
  return toCards(rows);
}

export type PublicCategory = TermView & {
  description: string;
  parentId: string | null;
  count: number;
};

/** Categories that have at least one live post (empty ones stay out of navigation and the sitemap). */
export async function listPublicCategories(now = new Date()): Promise<PublicCategory[]> {
  await connectDb();
  const [categories, counts] = await Promise.all([
    Category.find({}).sort({ name: 1 }).lean(),
    Post.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: live(now) },
      { $unwind: "$categoryIds" },
      { $group: { _id: "$categoryIds", count: { $sum: 1 } } },
    ]),
  ]);
  const countOf = new Map(counts.map((c) => [String(c._id), c.count]));
  return categories
    .filter((c: CategoryRecord) => (countOf.get(String(c._id)) ?? 0) > 0)
    .map((c) => ({
      id: String(c._id),
      name: c.name,
      slug: c.slug,
      description: c.description,
      parentId: c.parentId ? String(c.parentId) : null,
      count: countOf.get(String(c._id)) ?? 0,
    }));
}

export async function findCategoryBySlug(slug: string): Promise<CategoryRecord | null> {
  await connectDb();
  return Category.findOne({ slug }).lean();
}

export async function findTagBySlug(slug: string): Promise<TagRecord | null> {
  await connectDb();
  return Tag.findOne({ slug }).lean();
}

export async function listPublicTags(now = new Date()): Promise<(TermView & { count: number })[]> {
  await connectDb();
  const counts = await Post.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: live(now) },
    { $unwind: "$tagIds" },
    { $group: { _id: "$tagIds", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  const tags = await Tag.find({ _id: { $in: counts.map((c) => c._id) } }).lean();
  const byId = new Map(tags.map((t) => [String(t._id), t]));
  return counts.flatMap((row) => {
    const tag = byId.get(String(row._id));
    return tag ? [{ id: String(tag._id), name: tag.name, slug: tag.slug, count: row.count }] : [];
  });
}

/** Slugs and dates for the sitemap and static generation. */
export async function listLiveSlugs(
  now = new Date(),
): Promise<{ slug: string; updatedAt: Date }[]> {
  await connectDb();
  const rows = await Post.find(live(now), { slug: 1, updatedAt: 1 })
    .sort({ publishedAt: -1 })
    .lean();
  return rows.map((row) => ({ slug: row.slug, updatedAt: row.updatedAt }));
}

export async function latestForFeed(limit = 20, now = new Date()) {
  await connectDb();
  const rows = await Post.find(live(now)).sort({ publishedAt: -1 }).limit(limit).lean();
  return Promise.all(rows.map(toPublicPost));
}
