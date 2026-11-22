// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { parseRichText, type RichDoc } from "@/lib/rich-text";
import { disconnectDb } from "@/server/db/connection";
import { Category, Post, Tag } from "@/server/db/models/blog";
import { User } from "@/server/db/models/user";
import { startTestDatabase } from "@/test/mongo";

import {
  bulkAction,
  createPost,
  getPostDetail,
  listPosts,
  publishDuePosts,
  updatePost,
  type BlogActor,
  type PostInput,
} from "./blog-admin";
import {
  findPostBySlug,
  listLivePosts,
  listPublicCategories,
  listPublicTags,
  relatedPosts,
} from "./blog-public";
import {
  createCategory,
  deleteCategory,
  deleteTag,
  ensureDefaultCategory,
  listCategories,
  listTags,
  resolveTagIds,
  updateCategory,
} from "./blog-taxonomy";

let server: MongoMemoryServer;
let authorId: string;

beforeAll(async () => {
  server = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await disconnectDb();
  await server.stop();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  const { connectDb } = await import("@/server/db/connection");
  await connectDb();
  await Promise.all([
    Post.deleteMany({}),
    Category.deleteMany({}),
    Tag.deleteMany({}),
    User.deleteMany({}),
  ]);
  const author = await User.create({
    email: "ed@example.com",
    firstName: "Edith",
    lastName: "Writer",
    passwordHash: "x",
  });
  authorId = String(author._id);
});

const IMG = "https://cdn.shopify.com/s/files/1/0001/fern.jpg";
const doc = (text = "Hello world"): RichDoc =>
  parseRichText({
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Light" }] },
      { type: "paragraph", content: [{ type: "text", text }] },
    ],
  });

const full = (): BlogActor => ({ userId: authorId, canPublish: true, canDelete: true });
const writer = (): BlogActor => ({ userId: authorId, canPublish: false, canDelete: false });

const input = (over: Partial<PostInput> = {}): PostInput => ({
  title: "Caring for ferns",
  content: doc(),
  categoryIds: [],
  tags: [],
  template: "classic",
  status: "draft",
  ...over,
});

const future = (ms = 3_600_000) => new Date(Date.now() + ms).toISOString();

describe("categories", () => {
  it("creates the default category on first use, only once, even under concurrency", async () => {
    await Promise.all(Array.from({ length: 8 }, () => ensureDefaultCategory()));
    expect(await Category.countDocuments({ isDefault: true })).toBe(1);
    expect((await Category.findOne({ isDefault: true }))?.name).toBe("Uncategorized");
  });

  it("makes unique slugs automatically and refuses explicit duplicates", async () => {
    const a = await createCategory({ name: "Plant Care" });
    const b = await createCategory({ name: "Plant Care" });
    expect([a.slug, b.slug]).toEqual(["plant-care", "plant-care-2"]);
    await expect(createCategory({ name: "X", slug: "plant-care" })).rejects.toMatchObject({
      code: "slug_taken",
      status: 409,
    });
    await expect(createCategory({ name: "X", slug: "Not A Slug" })).rejects.toMatchObject({
      code: "invalid_slug",
    });
  });

  it("builds a tree, prevents cycles and limits the depth to three levels", async () => {
    const top = await createCategory({ name: "Top" });
    const mid = await createCategory({ name: "Mid", parentId: top.id });
    const leaf = await createCategory({ name: "Leaf", parentId: mid.id });
    await expect(createCategory({ name: "Too deep", parentId: leaf.id })).rejects.toMatchObject({
      code: "category_too_deep",
    });
    await expect(updateCategory(top.id, { parentId: leaf.id })).rejects.toMatchObject({
      code: "category_cycle",
    });
    await expect(updateCategory(top.id, { parentId: top.id })).rejects.toMatchObject({
      code: "category_cycle",
    });
    await expect(
      updateCategory(leaf.id, { parentId: new Types.ObjectId().toString() }),
    ).rejects.toMatchObject({
      code: "parent_not_found",
    });
    // Moving a whole branch under a deep node would exceed the limit too.
    const other = await createCategory({ name: "Other" });
    await expect(updateCategory(top.id, { parentId: other.id })).rejects.toBeTruthy();
    await updateCategory(leaf.id, { parentId: null });
    expect((await listCategories()).find((c) => c.id === leaf.id)?.parentId).toBeNull();
  });

  it("deleting a category moves its children up and re-files its posts under Uncategorized", async () => {
    const parent = await createCategory({ name: "Parent" });
    const doomed = await createCategory({ name: "Doomed", parentId: parent.id });
    const child = await createCategory({ name: "Child", parentId: doomed.id });
    const post = await createPost(full(), input({ categoryIds: [doomed.id] }));
    const shared = await createPost(
      full(),
      input({ title: "Shared", categoryIds: [doomed.id, parent.id] }),
    );

    await deleteCategory(doomed.id);

    expect((await listCategories()).find((c) => c.id === child.id)?.parentId).toBe(parent.id);
    const fallback = await ensureDefaultCategory();
    expect((await getPostDetail(post.id)).categoryIds).toEqual([String(fallback._id)]);
    expect((await getPostDetail(shared.id)).categoryIds).toEqual([parent.id]);
  });

  it("never deletes the default category", async () => {
    const fallback = await ensureDefaultCategory();
    await expect(deleteCategory(String(fallback._id))).rejects.toMatchObject({
      code: "default_category",
    });
  });

  it("answers 404 for ids that don't exist or aren't ids", async () => {
    await expect(deleteCategory("not-an-id")).rejects.toMatchObject({ status: 404 });
    await expect(
      updateCategory(new Types.ObjectId().toString(), { name: "x" }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("tags", () => {
  it("creates tags from names, de-duplicating by slug and ignoring case and spacing", async () => {
    const ids = await resolveTagIds(["Low Light", "low  light", "LOW LIGHT", "Ferns", "  "]);
    expect(ids).toHaveLength(2);
    expect(await Tag.countDocuments()).toBe(2);
    expect(await resolveTagIds(["Ferns"])).toEqual([ids[1]]);
  });

  it("survives two requests creating the same tag at once", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => resolveTagIds(["Pet Safe"])));
    expect(new Set(results.map((r) => String(r[0]))).size).toBe(1);
    expect(await Tag.countDocuments()).toBe(1);
  });

  it("limits tags per post and removes a deleted tag from posts", async () => {
    await expect(
      resolveTagIds(Array.from({ length: 21 }, (_, i) => `tag ${i}`)),
    ).rejects.toMatchObject({
      code: "too_many_tags",
    });
    const post = await createPost(full(), input({ tags: ["a one", "b two"] }));
    const [tag] = await listTags();
    await deleteTag((tag as { id: string }).id);
    expect((await getPostDetail(post.id)).tags).toEqual(["b two"]);
  });
});

describe("creating and editing posts", () => {
  it("compiles the document once on save and files the post under Uncategorized by default", async () => {
    const post = await createPost(full(), input({ tags: ["Ferns"] }));
    const row = await Post.findById(post.id).lean();
    expect(row?.contentHtml).toBe('<h2 id="light">Light</h2><p>Hello world</p>');
    expect(row?.headings).toEqual([{ id: "light", text: "Light", level: 2 }]);
    expect(row?.readingMinutes).toBe(1);
    expect(row?.summary).toBe("Light Hello world");
    expect(post.categoryIds).toHaveLength(1);
    expect(post.tags).toEqual(["Ferns"]);
    expect(post.status).toBe("draft");
    expect(post.authorName).toBe("Edith Writer");
  });

  it("makes unique slugs from titles, and refuses taken or malformed explicit slugs", async () => {
    const a = await createPost(full(), input());
    const b = await createPost(full(), input());
    expect([a.slug, b.slug]).toEqual(["caring-for-ferns", "caring-for-ferns-2"]);
    await expect(createPost(full(), input({ slug: "caring-for-ferns" }))).rejects.toMatchObject({
      code: "slug_taken",
    });
    await expect(createPost(full(), input({ slug: "Bad Slug!" }))).rejects.toMatchObject({
      code: "invalid_slug",
    });
    const fromSymbols = await createPost(full(), input({ title: "!!!" }));
    expect(fromSymbols.slug).toMatch(/^post/);
  });

  it("keeps blog route words for itself: a post can't be called page, category, tag or feed", async () => {
    for (const reserved of ["page", "category", "tag", "feed"]) {
      await expect(createPost(full(), input({ slug: reserved }))).rejects.toMatchObject({
        code: "slug_reserved",
      });
    }
    // Titles that slugify to a reserved word get a free address instead.
    expect((await createPost(full(), input({ title: "Tag" }))).slug).toBe("tag-2");
  });

  it("rejects unknown categories and images from foreign hosts", async () => {
    await expect(
      createPost(full(), input({ categoryIds: [new Types.ObjectId().toString()] })),
    ).rejects.toMatchObject({ code: "category_not_found" });
    await expect(
      createPost(full(), input({ featuredImage: { url: "https://evil.example/a.png", alt: "x" } })),
    ).rejects.toMatchObject({ code: "invalid_image" });
    const ok = await createPost(
      full(),
      input({ featuredImage: { url: IMG, alt: "A fern", width: 800, height: 600 } }),
    );
    expect(ok.featuredImage).toEqual({ url: IMG, alt: "A fern", width: 800, height: 600 });
  });

  it("lets a writer without publish rights save drafts but not publish, schedule or touch live posts", async () => {
    const draft = await createPost(writer(), input());
    await expect(updatePost(writer(), draft.id, input({ title: "Edited" }))).resolves.toMatchObject(
      { title: "Edited" },
    );
    await expect(createPost(writer(), input({ status: "published" }))).rejects.toMatchObject({
      code: "publish_denied",
      status: 403,
    });
    await expect(
      updatePost(writer(), draft.id, input({ status: "scheduled", scheduledAt: future() })),
    ).rejects.toMatchObject({ code: "publish_denied" });

    const live = await createPost(full(), input({ title: "Live", status: "published" }));
    await expect(
      updatePost(writer(), live.id, input({ title: "Live", status: "draft" })),
    ).rejects.toMatchObject({
      code: "publish_denied",
    });
  });

  it("keeps the original publication date when a live post is edited", async () => {
    const created = await createPost(full(), input({ status: "published" }));
    const firstDate = (await Post.findById(created.id).lean())?.publishedAt;
    await new Promise((resolve) => setTimeout(resolve, 15));
    await updatePost(full(), created.id, input({ title: "Retitled", status: "published" }));
    expect((await Post.findById(created.id).lean())?.publishedAt).toEqual(firstDate);
  });

  it("schedules only for the future", async () => {
    await expect(createPost(full(), input({ status: "scheduled" }))).rejects.toMatchObject({
      code: "schedule_required",
    });
    await expect(
      createPost(full(), input({ status: "scheduled", scheduledAt: "not a date" })),
    ).rejects.toMatchObject({ code: "schedule_required" });
    await expect(
      createPost(
        full(),
        input({ status: "scheduled", scheduledAt: new Date(Date.now() - 1000).toISOString() }),
      ),
    ).rejects.toMatchObject({ code: "schedule_in_past" });
    const ok = await createPost(full(), input({ status: "scheduled", scheduledAt: future() }));
    expect(ok.status).toBe("scheduled");
  });

  it("keeps old addresses alive after a slug change, but only for posts that were public", async () => {
    const live = await createPost(full(), input({ title: "Old title", status: "published" }));
    await updatePost(
      full(),
      live.id,
      input({ title: "New title", slug: "new-title", status: "published" }),
    );
    expect(await findPostBySlug("old-title")).toEqual({ kind: "redirect", slug: "new-title" });
    expect((await findPostBySlug("new-title"))?.kind).toBe("post");
    // The retired address can't be claimed by another post (it would hijack the redirect).
    await expect(createPost(full(), input({ slug: "old-title" }))).rejects.toMatchObject({
      code: "slug_taken",
    });

    const draft = await createPost(full(), input({ title: "Secret draft" }));
    await updatePost(full(), draft.id, input({ title: "Secret draft", slug: "renamed-draft" }));
    expect((await Post.findById(draft.id).lean())?.previousSlugs).toEqual([]);
  });
});

describe("trash, restore and bulk actions", () => {
  it("moves to trash, blocks editing there, restores as a draft and deletes only from trash", async () => {
    const post = await createPost(full(), input({ status: "published" }));
    await expect(bulkAction(full(), [post.id], "delete")).resolves.toBe(0);
    expect(await Post.countDocuments()).toBe(1);

    expect(await bulkAction(full(), [post.id], "trash")).toBe(1);
    expect(await findPostBySlug(post.slug)).toBeNull();
    await expect(updatePost(full(), post.id, input())).rejects.toMatchObject({
      code: "post_in_trash",
    });

    expect(await bulkAction(full(), [post.id], "restore")).toBe(1);
    expect((await getPostDetail(post.id)).status).toBe("draft");
    expect(await findPostBySlug(post.slug)).toBeNull();

    await bulkAction(full(), [post.id], "trash");
    expect(await bulkAction(full(), [post.id], "delete")).toBe(1);
    expect(await Post.countDocuments()).toBe(0);
  });

  it("requires the right permission for each action", async () => {
    const post = await createPost(full(), input());
    await expect(bulkAction(writer(), [post.id], "trash")).rejects.toMatchObject({
      code: "delete_denied",
    });
    await expect(bulkAction(writer(), [post.id], "publish")).rejects.toMatchObject({
      code: "publish_denied",
    });
    await expect(
      bulkAction({ ...writer(), canPublish: true }, [post.id], "trash"),
    ).rejects.toMatchObject({ code: "delete_denied" });
  });

  it("publishes drafts and unpublishes live posts in bulk, ignoring posts in other states", async () => {
    const a = await createPost(full(), input({ title: "A" }));
    const b = await createPost(full(), input({ title: "B" }));
    const c = await createPost(full(), input({ title: "C", status: "published" }));
    expect(await bulkAction(full(), [a.id, b.id, c.id], "publish")).toBe(2);
    expect((await listPosts({ page: 1, perPage: 20 })).counts.published).toBe(3);
    expect(await bulkAction(full(), [a.id, c.id], "draft")).toBe(2);
    expect((await getPostDetail(a.id)).status).toBe("draft");
    expect(await bulkAction(full(), [new Types.ObjectId().toString()], "trash")).toBe(0);
  });
});

describe("admin list", () => {
  it("counts per status, filters, paginates and searches safely", async () => {
    await createPost(full(), input({ title: "Alpha (1)" }));
    await createPost(full(), input({ title: "Beta", status: "published" }));
    const gone = await createPost(full(), input({ title: "Gamma" }));
    await bulkAction(full(), [gone.id], "trash");

    const all = await listPosts({ page: 1, perPage: 20 });
    expect(all.counts).toEqual({ all: 2, draft: 1, scheduled: 0, published: 1, trash: 1 });
    expect(all.posts.map((p) => p.title).sort()).toEqual(["Alpha (1)", "Beta"]);
    expect((await listPosts({ page: 1, perPage: 20, status: "trash" })).posts[0]?.title).toBe(
      "Gamma",
    );
    expect((await listPosts({ page: 1, perPage: 20, search: "alpha (1)" })).total).toBe(1);
    // Regex metacharacters are searched literally and can't blow up or match everything.
    expect((await listPosts({ page: 1, perPage: 20, search: ".*" })).total).toBe(0);
    expect((await listPosts({ page: 1, perPage: 20, search: "[" })).total).toBe(0);
    expect((await listPosts({ page: 2, perPage: 1 })).posts).toHaveLength(1);
    expect((await listPosts({ page: 1, perPage: 20, categoryId: "nope" })).total).toBe(0);
  });
});

describe("what the public sees", () => {
  it("shows only live posts: drafts, scheduled-for-later and trashed posts stay hidden", async () => {
    const live = await createPost(full(), input({ title: "Live", status: "published" }));
    const draft = await createPost(full(), input({ title: "Draft" }));
    const later = await createPost(
      full(),
      input({ title: "Later", status: "scheduled", scheduledAt: future() }),
    );
    const trashed = await createPost(full(), input({ title: "Trashed", status: "published" }));
    await bulkAction(full(), [trashed.id], "trash");

    expect((await listLivePosts({ page: 1 })).cards.map((c) => c.title)).toEqual(["Live"]);
    for (const hidden of [draft, later, trashed])
      expect(await findPostBySlug(hidden.slug)).toBeNull();
    expect((await findPostBySlug(live.slug))?.kind).toBe("post");
  });

  it("makes a scheduled post public exactly when its time arrives, before any sweeper runs", async () => {
    const post = await createPost(
      full(),
      input({ status: "scheduled", scheduledAt: future(60_000) }),
    );
    expect(await findPostBySlug(post.slug)).toBeNull();
    const afterDue = new Date(Date.now() + 61_000);
    expect((await findPostBySlug(post.slug, afterDue))?.kind).toBe("post");
    expect((await listLivePosts({ page: 1, now: afterDue })).total).toBe(1);

    expect(await publishDuePosts(afterDue)).toBe(1);
    expect((await Post.findById(post.id).lean())?.status).toBe("published");
    expect(await publishDuePosts(afterDue)).toBe(0);
  });

  it("returns the compiled page with author, terms, headings and an excerpt", async () => {
    const category = await createCategory({ name: "Plant Care" });
    const created = await createPost(
      full(),
      input({
        status: "published",
        categoryIds: [category.id],
        tags: ["Ferns"],
        template: "guide",
      }),
    );
    const found = await findPostBySlug(created.slug);
    expect(found?.kind === "post" && found.post).toMatchObject({
      title: "Caring for ferns",
      html: '<h2 id="light">Light</h2><p>Hello world</p>',
      authorName: "Edith Writer",
      template: "guide",
      excerpt: "Light Hello world",
      categories: [{ name: "Plant Care", slug: "plant-care" }],
      tags: [{ name: "Ferns", slug: "ferns" }],
    });
    await updatePost(
      full(),
      created.id,
      input({ status: "published", excerpt: "Written by hand" }),
    );
    const edited = await findPostBySlug(created.slug);
    expect(edited?.kind === "post" && edited.post.excerpt).toBe("Written by hand");
  });

  it("paginates newest first and filters by category and tag", async () => {
    const care = await createCategory({ name: "Care" });
    for (let i = 1; i <= 11; i++) {
      await createPost(
        full(),
        input({
          title: `Post ${i}`,
          status: "published",
          categoryIds: i % 2 ? [care.id] : [],
          tags: i === 11 ? ["Last"] : [],
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const first = await listLivePosts({ page: 1 });
    expect(first.total).toBe(11);
    expect(first.pages).toBe(2);
    expect(first.cards).toHaveLength(9);
    expect(first.cards[0]?.title).toBe("Post 11");
    expect((await listLivePosts({ page: 2 })).cards).toHaveLength(2);
    expect((await listLivePosts({ page: 1, categoryId: care.id })).total).toBe(6);
    const tags = await listPublicTags();
    expect(tags).toEqual([expect.objectContaining({ name: "Last", count: 1 })]);
    expect((await listLivePosts({ page: 1, tagId: tags[0]?.id as string })).cards[0]?.title).toBe(
      "Post 11",
    );
  });

  it("recommends related posts without the post itself and tops up from the newest", async () => {
    const care = await createCategory({ name: "Care" });
    const a = await createPost(
      full(),
      input({ title: "A", status: "published", categoryIds: [care.id] }),
    );
    await createPost(full(), input({ title: "B", status: "published", categoryIds: [care.id] }));
    await createPost(full(), input({ title: "C", status: "published" }));
    const found = await findPostBySlug(a.slug);
    if (found?.kind !== "post") throw new Error("expected a post");
    const related = await relatedPosts(found.post, 3);
    expect(related.map((r) => r.title).sort()).toEqual(["B", "C"]);
    expect(related.some((r) => r.id === a.id)).toBe(false);
  });

  it("lists only categories that have live posts", async () => {
    const used = await createCategory({ name: "Used" });
    await createCategory({ name: "Empty" });
    await createPost(full(), input({ status: "published", categoryIds: [used.id] }));
    await createPost(full(), input({ title: "Hidden draft", categoryIds: [] }));
    expect((await listPublicCategories()).map((c) => c.name)).toEqual(["Used"]);
  });
});
