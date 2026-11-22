import "server-only";

import { Types } from "mongoose";

import type { BlogTemplateId } from "@/lib/blog-templates";
import type {
  FeaturedImage,
  PostCounts,
  PostDetail,
  PostListItem,
  PostStatus,
  TermView,
} from "@/lib/blog-types";
import {
  autoExcerpt,
  documentText,
  readingMinutes,
  renderRichText,
  safeImageSrc,
  type RichDoc,
} from "@/lib/rich-text";
import { RESERVED_POST_SLUGS, SLUG_PATTERN, slugify } from "@/lib/slug";
import { connectDb } from "@/server/db/connection";
import { Category, Post, Tag, type PostRecord } from "@/server/db/models/blog";
import { User } from "@/server/db/models/user";
import { badRequest, conflict, forbidden, notFound } from "@/server/http/errors";
import { resolveCategoryIds, resolveTagIds, uniqueSlug } from "@/server/services/blog-taxonomy";

/** What the caller may do, resolved from their role by the route (never from the request body). */
export type BlogActor = { userId: string; canPublish: boolean; canDelete: boolean };

export type PostInput = {
  title: string;
  slug?: string | undefined;
  excerpt?: string | undefined;
  content: RichDoc;
  featuredImage?: FeaturedImage | null | undefined;
  categoryIds: string[];
  tags: string[];
  template: BlogTemplateId;
  seoTitle?: string | undefined;
  seoDescription?: string | undefined;
  status: "draft" | "published" | "scheduled";
  /** Required for `scheduled`: the moment the post goes live. */
  scheduledAt?: string | null | undefined;
};

const MAX_PREVIOUS_SLUGS = 20;
const LIVE: readonly PostStatus[] = ["published", "scheduled"];

const toId = (value: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(value)) throw notFound("Post not found", "post_not_found");
  return new Types.ObjectId(value);
};

const isDuplicateKey = (error: unknown): boolean => (error as { code?: number }).code === 11000;

async function slugTaken(slug: string, selfId?: Types.ObjectId): Promise<boolean> {
  if (RESERVED_POST_SLUGS.includes(slug)) return true;
  return Boolean(
    await Post.exists({
      $or: [{ slug }, { previousSlugs: slug }],
      ...(selfId ? { _id: { $ne: selfId } } : {}),
    }),
  );
}

function checkImage(image: FeaturedImage | null | undefined): FeaturedImage | undefined {
  if (!image) return undefined;
  const url = safeImageSrc(image.url);
  if (!url)
    throw badRequest("The featured image comes from a source that isn't allowed.", "invalid_image");
  return {
    url,
    alt: image.alt.slice(0, 300),
    ...(image.width && image.height ? { width: image.width, height: image.height } : {}),
  };
}

/** Decides status, publication time and trash bookkeeping for a save. */
function scheduleFields(
  input: PostInput,
  existing: PostRecord | null,
  now: Date,
): { status: PostStatus; publishedAt: Date | undefined } {
  if (input.status === "draft") return { status: "draft", publishedAt: existing?.publishedAt };
  if (input.status === "published") {
    // Keep the original publication date when an already-published post is edited or re-published.
    const keep = existing && existing.publishedAt && existing.publishedAt <= now;
    return { status: "published", publishedAt: keep ? existing.publishedAt : now };
  }
  const at = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (!at || Number.isNaN(at.getTime()))
    throw badRequest("Choose when the post should go live.", "schedule_required");
  if (at <= now) throw badRequest("The scheduled time must be in the future.", "schedule_in_past");
  return { status: "scheduled", publishedAt: at };
}

function assertMayChange(actor: BlogActor, existing: PostRecord | null, input: PostInput): void {
  const touchesLive =
    (existing !== null && LIVE.includes(existing.status)) || input.status !== "draft";
  if (touchesLive && !actor.canPublish) {
    throw forbidden("You don't have permission to publish or edit live posts.", "publish_denied");
  }
}

async function compile(input: PostInput) {
  const { html, headings } = renderRichText(input.content);
  const text = documentText(input.content);
  const [categoryIds, tagIds] = await Promise.all([
    resolveCategoryIds(input.categoryIds),
    resolveTagIds(input.tags),
  ]);
  const featuredImage = checkImage(input.featuredImage);
  return {
    contentHtml: html,
    headings,
    searchText: text.slice(0, 60_000),
    summary: autoExcerpt(text),
    readingMinutes: readingMinutes(text),
    categoryIds,
    tagIds,
    featuredImage,
  };
}

export async function createPost(actor: BlogActor, input: PostInput): Promise<PostDetail> {
  await connectDb();
  assertMayChange(actor, null, input);
  const now = new Date();
  const { status, publishedAt } = scheduleFields(input, null, now);
  const compiled = await compile(input);
  const slug = input.slug
    ? await explicitSlug(input.slug)
    : await uniqueSlug(slugify(input.title), (s) => slugTaken(s), "post");

  try {
    const created = await Post.create({
      title: input.title,
      slug,
      excerpt: input.excerpt ?? "",
      content: input.content,
      contentHtml: compiled.contentHtml,
      headings: compiled.headings,
      searchText: compiled.searchText,
      summary: compiled.summary,
      readingMinutes: compiled.readingMinutes,
      ...(compiled.featuredImage ? { featuredImage: compiled.featuredImage } : {}),
      status,
      ...(publishedAt ? { publishedAt } : {}),
      authorId: toId(actor.userId),
      categoryIds: compiled.categoryIds,
      tagIds: compiled.tagIds,
      template: input.template,
      seoTitle: input.seoTitle ?? "",
      seoDescription: input.seoDescription ?? "",
    });
    return await getPostDetail(String(created._id));
  } catch (error) {
    if (isDuplicateKey(error)) throw conflict("Another post already uses that slug.", "slug_taken");
    throw error;
  }
}

async function explicitSlug(slug: string, selfId?: Types.ObjectId): Promise<string> {
  if (!SLUG_PATTERN.test(slug) || slug.length > 80)
    throw badRequest("Use lowercase letters, digits and hyphens.", "invalid_slug");
  if (RESERVED_POST_SLUGS.includes(slug))
    throw conflict(
      "That address is reserved for the blog itself. Choose another.",
      "slug_reserved",
    );
  if (await slugTaken(slug, selfId))
    throw conflict("Another post already uses that slug.", "slug_taken");
  return slug;
}

export async function updatePost(
  actor: BlogActor,
  id: string,
  input: PostInput,
): Promise<PostDetail> {
  await connectDb();
  const _id = toId(id);
  const existing = await Post.findById(_id).lean();
  if (!existing) throw notFound("Post not found", "post_not_found");
  if (existing.status === "trash")
    throw conflict("Restore this post from the trash before editing it.", "post_in_trash");
  assertMayChange(actor, existing, input);

  const now = new Date();
  const { status, publishedAt } = scheduleFields(input, existing, now);
  const compiled = await compile(input);

  let slug = existing.slug;
  let previousSlugs = existing.previousSlugs;
  if (input.slug && input.slug !== existing.slug) {
    slug = await explicitSlug(input.slug, _id);
    // A post that was ever public keeps its old address alive through a redirect.
    if (existing.publishedAt) {
      previousSlugs = [existing.slug, ...previousSlugs.filter((s) => s !== slug)].slice(
        0,
        MAX_PREVIOUS_SLUGS,
      );
    }
  }

  const set = {
    title: input.title,
    slug,
    previousSlugs,
    excerpt: input.excerpt ?? "",
    content: input.content,
    contentHtml: compiled.contentHtml,
    headings: compiled.headings,
    searchText: compiled.searchText,
    summary: compiled.summary,
    readingMinutes: compiled.readingMinutes,
    status,
    categoryIds: compiled.categoryIds,
    tagIds: compiled.tagIds,
    template: input.template,
    seoTitle: input.seoTitle ?? "",
    seoDescription: input.seoDescription ?? "",
    ...(publishedAt ? { publishedAt } : {}),
    ...(compiled.featuredImage ? { featuredImage: compiled.featuredImage } : {}),
  };
  const unset = {
    ...(compiled.featuredImage ? {} : { featuredImage: 1 }),
    ...(publishedAt ? {} : { publishedAt: 1 }),
  };
  try {
    await Post.updateOne(
      { _id },
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    );
  } catch (error) {
    if (isDuplicateKey(error)) throw conflict("Another post already uses that slug.", "slug_taken");
    throw error;
  }
  return getPostDetail(id);
}

export type BulkAction = "trash" | "restore" | "delete" | "publish" | "draft";

/**
 * Bulk and single status changes from the list (WordPress "Bulk actions"). Returns how many posts changed.
 * Moving to trash and deleting need `blog:delete`; publishing and unpublishing need `blog:publish`.
 */
export async function bulkAction(
  actor: BlogActor,
  ids: readonly string[],
  action: BulkAction,
): Promise<number> {
  await connectDb();
  const objectIds = [...new Set(ids)].map(toId);
  const needsDelete = action === "trash" || action === "restore" || action === "delete";
  if (needsDelete && !actor.canDelete)
    throw forbidden("You don't have permission to delete posts.", "delete_denied");
  if (!needsDelete && !actor.canPublish)
    throw forbidden("You don't have permission to publish posts.", "publish_denied");

  const now = new Date();
  switch (action) {
    case "trash": {
      const result = await Post.updateMany(
        { _id: { $in: objectIds }, status: { $ne: "trash" } },
        { $set: { status: "trash", trashedAt: now } },
      );
      return result.modifiedCount;
    }
    case "restore": {
      // Restored posts come back as drafts (never silently live), like WordPress.
      const result = await Post.updateMany(
        { _id: { $in: objectIds }, status: "trash" },
        { $set: { status: "draft" }, $unset: { trashedAt: 1 } },
      );
      return result.modifiedCount;
    }
    case "delete": {
      const result = await Post.deleteMany({ _id: { $in: objectIds }, status: "trash" });
      return result.deletedCount;
    }
    case "publish": {
      const posts = await Post.find(
        { _id: { $in: objectIds }, status: "draft" },
        { publishedAt: 1 },
      ).lean();
      let changed = 0;
      for (const post of posts) {
        const keep = post.publishedAt && post.publishedAt <= now ? post.publishedAt : now;
        const result = await Post.updateOne(
          { _id: post._id, status: "draft" },
          { $set: { status: "published", publishedAt: keep } },
        );
        changed += result.modifiedCount;
      }
      return changed;
    }
    case "draft": {
      const result = await Post.updateMany(
        { _id: { $in: objectIds }, status: { $in: [...LIVE] } },
        { $set: { status: "draft" } },
      );
      return result.modifiedCount;
    }
  }
}

const authorNames = async (ids: Types.ObjectId[]): Promise<Map<string, string>> => {
  const users = await User.find({ _id: { $in: ids } }, { firstName: 1, lastName: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), `${u.firstName} ${u.lastName}`]));
};

const termMaps = async (categoryIds: Types.ObjectId[], tagIds: Types.ObjectId[]) => {
  const [categories, tags] = await Promise.all([
    Category.find({ _id: { $in: categoryIds } }, { name: 1, slug: 1 }).lean(),
    Tag.find({ _id: { $in: tagIds } }, { name: 1, slug: 1 }).lean(),
  ]);
  const view = (t: { _id: Types.ObjectId; name: string; slug: string }): TermView => ({
    id: String(t._id),
    name: t.name,
    slug: t.slug,
  });
  return {
    categories: new Map(categories.map((c) => [String(c._id), view(c)])),
    tags: new Map(tags.map((t) => [String(t._id), view(t)])),
  };
};

export type PostQuery = {
  status?: PostStatus | undefined;
  search?: string | undefined;
  categoryId?: string | undefined;
  page: number;
  perPage: number;
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listPosts(
  query: PostQuery,
): Promise<{ posts: PostListItem[]; total: number; counts: PostCounts }> {
  await connectDb();
  const filter: Record<string, unknown> = query.status
    ? { status: query.status }
    : { status: { $ne: "trash" } };
  if (query.search?.trim())
    filter["title"] = { $regex: escapeRegex(query.search.trim()), $options: "i" };
  if (query.categoryId) {
    if (!Types.ObjectId.isValid(query.categoryId)) return emptyList();
    filter["categoryIds"] = new Types.ObjectId(query.categoryId);
  }

  const [rows, total, grouped] = await Promise.all([
    Post.find(filter, { content: 0, contentHtml: 0, headings: 0, searchText: 0, summary: 0 })
      .sort({ updatedAt: -1 })
      .skip((query.page - 1) * query.perPage)
      .limit(query.perPage)
      .lean(),
    Post.countDocuments(filter),
    Post.aggregate<{ _id: PostStatus; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const [names, terms] = await Promise.all([
    authorNames([...new Set(rows.map((r) => r.authorId))]),
    termMaps(
      rows.flatMap((r) => r.categoryIds),
      rows.flatMap((r) => r.tagIds),
    ),
  ]);
  const counts: PostCounts = { all: 0, draft: 0, scheduled: 0, published: 0, trash: 0 };
  for (const row of grouped) {
    counts[row._id] = row.count;
    if (row._id !== "trash") counts.all += row.count;
  }
  return {
    posts: rows.map((row) => ({
      id: String(row._id),
      title: row.title,
      slug: row.slug,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      authorName: names.get(String(row.authorId)) ?? "Unknown",
      categories: row.categoryIds.flatMap((id) => terms.categories.get(String(id)) ?? []),
      tags: row.tagIds.flatMap((id) => terms.tags.get(String(id)) ?? []),
      template: row.template,
    })),
    total,
    counts,
  };
}

const emptyList = () => ({
  posts: [],
  total: 0,
  counts: { all: 0, draft: 0, scheduled: 0, published: 0, trash: 0 } as PostCounts,
});

export async function getPostDetail(id: string): Promise<PostDetail> {
  await connectDb();
  const post = await Post.findById(toId(id)).lean();
  if (!post) throw notFound("Post not found", "post_not_found");
  const [names, terms] = await Promise.all([
    authorNames([post.authorId]),
    termMaps([], post.tagIds),
  ]);
  return {
    id: String(post._id),
    title: post.title,
    slug: post.slug,
    status: post.status,
    excerpt: post.excerpt,
    content: post.content,
    featuredImage: post.featuredImage ?? null,
    categoryIds: post.categoryIds.map(String),
    tags: post.tagIds.flatMap((tagId) => terms.tags.get(String(tagId))?.name ?? []),
    template: post.template,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    updatedAt: post.updatedAt.toISOString(),
    authorName: names.get(String(post.authorId)) ?? "Unknown",
  };
}

/**
 * Flips scheduled posts whose time has come to published. Public pages already treat them as live from that
 * moment (see `blog-public`), so this only keeps the admin's status honest. Returns how many changed.
 */
export async function publishDuePosts(now = new Date()): Promise<number> {
  await connectDb();
  const result = await Post.updateMany(
    { status: "scheduled", publishedAt: { $lte: now } },
    { $set: { status: "published" } },
  );
  return result.modifiedCount;
}
