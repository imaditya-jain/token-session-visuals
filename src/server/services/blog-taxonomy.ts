import "server-only";

import { Types } from "mongoose";

import type { CategoryView, TagView } from "@/lib/blog-types";
import { SLUG_PATTERN, slugify } from "@/lib/slug";
import { connectDb } from "@/server/db/connection";
import { Category, Post, Tag, type CategoryRecord } from "@/server/db/models/blog";
import { badRequest, conflict, notFound } from "@/server/http/errors";

/** Levels allowed in the category tree (top level = 1). Deeper trees are unreadable in menus and breadcrumbs. */
export const MAX_CATEGORY_DEPTH = 3;
export const MAX_TAGS_PER_POST = 20;
export const DEFAULT_CATEGORY = { name: "Uncategorized", slug: "uncategorized" } as const;

/** `base`, then `base-2`, `base-3`… until `taken` says it's free. */
export async function uniqueSlug(
  base: string,
  taken: (slug: string) => Promise<boolean>,
  fallback = "item",
): Promise<string> {
  const root = base || fallback;
  for (let n = 1; n <= 100; n++) {
    const candidate = n === 1 ? root : `${root.slice(0, 74)}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${root.slice(0, 66)}-${Date.now().toString(36)}`;
}

const isDuplicateKey = (error: unknown): boolean => (error as { code?: number }).code === 11000;

const toId = (value: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(value)) throw notFound("Not found");
  return new Types.ObjectId(value);
};

/** The built-in fallback category, created on first use. Safe under concurrency (unique partial index). */
export async function ensureDefaultCategory(): Promise<CategoryRecord> {
  await connectDb();
  const existing = await Category.findOne({ isDefault: true }).lean();
  if (existing) return existing;
  const slug = await uniqueSlug(DEFAULT_CATEGORY.slug, (candidate) =>
    Category.exists({ slug: candidate }).then(Boolean),
  );
  try {
    return (
      await Category.create({ name: DEFAULT_CATEGORY.name, slug, isDefault: true })
    ).toObject();
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const winner = await Category.findOne({ isDefault: true }).lean();
    if (winner) return winner;
    throw error;
  }
}

const depthOf = (id: string, byId: Map<string, CategoryRecord>): number => {
  let depth = 0;
  let current: string | undefined = id;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    depth++;
    const parent: Types.ObjectId | undefined = byId.get(current)?.parentId;
    current = parent ? String(parent) : undefined;
  }
  return depth;
};

const descendantsOf = (id: string, all: CategoryRecord[]): Set<string> => {
  const out = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const head = queue.pop() as string;
    for (const category of all) {
      if (
        category.parentId &&
        String(category.parentId) === head &&
        !out.has(String(category._id))
      ) {
        out.add(String(category._id));
        queue.push(String(category._id));
      }
    }
  }
  return out;
};

/** Height of the subtree under `id` (a leaf = 1). */
const subtreeHeight = (id: string, all: CategoryRecord[]): number => {
  const children = all.filter((c) => c.parentId && String(c.parentId) === id);
  return 1 + Math.max(0, ...children.map((child) => subtreeHeight(String(child._id), all)));
};

export async function listCategories(): Promise<CategoryView[]> {
  await ensureDefaultCategory();
  const [categories, counts] = await Promise.all([
    Category.find({}).sort({ name: 1 }).lean(),
    Post.aggregate<{ _id: Types.ObjectId; total: number; published: number }>([
      { $match: { status: { $ne: "trash" } } },
      { $unwind: "$categoryIds" },
      {
        $group: {
          _id: "$categoryIds",
          total: { $sum: 1 },
          published: { $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const countOf = new Map(counts.map((row) => [String(row._id), row]));
  return categories.map((category) => ({
    id: String(category._id),
    name: category.name,
    slug: category.slug,
    description: category.description,
    parentId: category.parentId ? String(category.parentId) : null,
    isDefault: category.isDefault,
    count: countOf.get(String(category._id))?.published ?? 0,
    totalCount: countOf.get(String(category._id))?.total ?? 0,
  }));
}

export type CategoryInput = {
  name: string;
  slug?: string | undefined;
  description?: string | undefined;
  parentId?: string | null | undefined;
};

async function assertParent(parentId: string, selfId?: string): Promise<Types.ObjectId> {
  const all = await Category.find({}).lean();
  const byId = new Map(all.map((c) => [String(c._id), c]));
  if (!byId.has(parentId))
    throw badRequest("The parent category doesn't exist.", "parent_not_found");
  if (selfId) {
    if (parentId === selfId || descendantsOf(selfId, all).has(parentId)) {
      throw badRequest(
        "A category can't be placed under itself or its own children.",
        "category_cycle",
      );
    }
  }
  const below = selfId ? subtreeHeight(selfId, all) : 1;
  if (depthOf(parentId, byId) + below > MAX_CATEGORY_DEPTH) {
    throw badRequest(
      `Categories can be nested ${MAX_CATEGORY_DEPTH} levels deep at most.`,
      "category_too_deep",
    );
  }
  return toId(parentId);
}

async function explicitSlug(slug: string, selfId?: Types.ObjectId): Promise<string> {
  if (!SLUG_PATTERN.test(slug))
    throw badRequest("Use lowercase letters, digits and hyphens.", "invalid_slug");
  const clash = await Category.exists({ slug, ...(selfId ? { _id: { $ne: selfId } } : {}) });
  if (clash) throw conflict("Another category already uses that slug.", "slug_taken");
  return slug;
}

export async function createCategory(input: CategoryInput): Promise<CategoryView> {
  await ensureDefaultCategory();
  const parentId = input.parentId ? await assertParent(input.parentId) : undefined;
  const slug = input.slug
    ? await explicitSlug(input.slug)
    : await uniqueSlug(
        slugify(input.name),
        (candidate) => Category.exists({ slug: candidate }).then(Boolean),
        "category",
      );
  try {
    const created = await Category.create({
      name: input.name,
      slug,
      description: input.description ?? "",
      ...(parentId ? { parentId } : {}),
    });
    return {
      id: String(created._id),
      name: created.name,
      slug: created.slug,
      description: created.description,
      parentId: parentId ? String(parentId) : null,
      isDefault: false,
      count: 0,
      totalCount: 0,
    };
  } catch (error) {
    if (isDuplicateKey(error))
      throw conflict("Another category already uses that slug.", "slug_taken");
    throw error;
  }
}

export async function updateCategory(
  id: string,
  patch: {
    name?: string | undefined;
    slug?: string | undefined;
    description?: string | undefined;
    parentId?: string | null | undefined;
  },
): Promise<void> {
  await connectDb();
  const _id = toId(id);
  const existing = await Category.findById(_id).lean();
  if (!existing) throw notFound("Category not found", "category_not_found");

  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (patch.name !== undefined) set["name"] = patch.name;
  if (patch.description !== undefined) set["description"] = patch.description;
  if (patch.slug !== undefined) set["slug"] = await explicitSlug(patch.slug, _id);
  if (patch.parentId !== undefined) {
    if (patch.parentId === null) unset["parentId"] = 1;
    else set["parentId"] = await assertParent(patch.parentId, id);
  }
  await Category.updateOne(
    { _id },
    {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
  );
}

/**
 * Like WordPress: children move up to the deleted category's parent, and posts that lose their only category
 * fall back to "Uncategorized". The default category itself can't be deleted.
 */
export async function deleteCategory(id: string): Promise<void> {
  await connectDb();
  const _id = toId(id);
  const category = await Category.findById(_id).lean();
  if (!category) throw notFound("Category not found", "category_not_found");
  if (category.isDefault)
    throw conflict("The default category can't be deleted.", "default_category");

  const fallback = await ensureDefaultCategory();
  await Category.updateMany(
    { parentId: _id },
    category.parentId ? { $set: { parentId: category.parentId } } : { $unset: { parentId: 1 } },
  );
  await Post.updateMany({ categoryIds: _id }, { $pull: { categoryIds: _id } });
  await Post.updateMany({ categoryIds: { $size: 0 } }, { $set: { categoryIds: [fallback._id] } });
  await Category.deleteOne({ _id });
}

/** Existing category ids only; no categories at all means "Uncategorized". */
export async function resolveCategoryIds(ids: readonly string[]): Promise<Types.ObjectId[]> {
  await connectDb();
  const unique = [...new Set(ids)];
  if (unique.some((id) => !Types.ObjectId.isValid(id)))
    throw badRequest("Unknown category.", "category_not_found");
  if (unique.length === 0) return [(await ensureDefaultCategory())._id];
  const found = await Category.find({ _id: { $in: unique } }, { _id: 1 }).lean();
  if (found.length !== unique.length) throw badRequest("Unknown category.", "category_not_found");
  return found.map((category) => category._id);
}

export async function listTags(): Promise<TagView[]> {
  await connectDb();
  const [tags, counts] = await Promise.all([
    Tag.find({}).sort({ name: 1 }).lean(),
    Post.aggregate<{ _id: Types.ObjectId; published: number }>([
      { $match: { status: "published" } },
      { $unwind: "$tagIds" },
      { $group: { _id: "$tagIds", published: { $sum: 1 } } },
    ]),
  ]);
  const countOf = new Map(counts.map((row) => [String(row._id), row.published]));
  return tags.map((tag) => ({
    id: String(tag._id),
    name: tag.name,
    slug: tag.slug,
    count: countOf.get(String(tag._id)) ?? 0,
  }));
}

/** Tag names → ids, creating the ones that don't exist yet (so authors can just type tags, as in WordPress). */
export async function resolveTagIds(names: readonly string[]): Promise<Types.ObjectId[]> {
  await connectDb();
  const bySlug = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    const slug = slugify(name);
    if (name && slug && !bySlug.has(slug)) bySlug.set(slug, name.slice(0, 60));
  }
  if (bySlug.size > MAX_TAGS_PER_POST)
    throw badRequest(`A post can have at most ${MAX_TAGS_PER_POST} tags.`, "too_many_tags");

  const ids: Types.ObjectId[] = [];
  for (const [slug, name] of bySlug) {
    const found = await Tag.findOne({ slug }, { _id: 1 }).lean();
    if (found) {
      ids.push(found._id);
      continue;
    }
    try {
      ids.push((await Tag.create({ name, slug }))._id);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const winner = await Tag.findOne({ slug }, { _id: 1 }).lean();
      if (!winner) throw error;
      ids.push(winner._id);
    }
  }
  return ids;
}

export async function updateTag(
  id: string,
  patch: { name?: string | undefined; slug?: string | undefined },
): Promise<void> {
  await connectDb();
  const _id = toId(id);
  const set: Record<string, string> = {};
  if (patch.name !== undefined) set["name"] = patch.name;
  if (patch.slug !== undefined) {
    if (!SLUG_PATTERN.test(patch.slug))
      throw badRequest("Use lowercase letters, digits and hyphens.", "invalid_slug");
    if (await Tag.exists({ slug: patch.slug, _id: { $ne: _id } }))
      throw conflict("Another tag already uses that slug.", "slug_taken");
    set["slug"] = patch.slug;
  }
  const result = await Tag.updateOne({ _id }, { $set: set });
  if (result.matchedCount === 0) throw notFound("Tag not found", "tag_not_found");
}

export async function deleteTag(id: string): Promise<void> {
  await connectDb();
  const _id = toId(id);
  const result = await Tag.deleteOne({ _id });
  if (result.deletedCount === 0) throw notFound("Tag not found", "tag_not_found");
  await Post.updateMany({ tagIds: _id }, { $pull: { tagIds: _id } });
}
