// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const uploadImageToShopify = vi.fn();
vi.mock("@/server/shopify/files", () => ({
  uploadImageToShopify: (...a: unknown[]) => uploadImageToShopify(...a),
  updateShopifyFileAlt: vi.fn().mockResolvedValue(undefined),
  deleteShopifyFile: vi.fn().mockResolvedValue(undefined),
}));

import { disconnectDb } from "@/server/db/connection";
import { AuditLog } from "@/server/db/models/audit-log";
import { Category, MediaAsset, Post, Tag } from "@/server/db/models/blog";
import { EmailJob } from "@/server/db/models/email-job";
import { OtpChallenge } from "@/server/db/models/otp-challenge";
import { RateLimit } from "@/server/db/models/rate-limit";
import { Role } from "@/server/db/models/role";
import { User } from "@/server/db/models/user";
import { adminSession, apiRequest } from "@/test/admin-session";
import { startTestDatabase } from "@/test/mongo";

import { GET as listCategories, POST as createCategory } from "./categories/route";
import { DELETE as deleteCategory, PATCH as patchCategory } from "./categories/[id]/route";
import { DELETE as deleteMedia } from "./media/[id]/route";
import { GET as listMedia, POST as uploadMedia } from "./media/route";
import { POST as bulk } from "./posts/bulk/route";
import { GET as getPost, PUT as putPost } from "./posts/[id]/route";
import { GET as listPosts, POST as createPost } from "./posts/route";
import { GET as listTags } from "./tags/route";
import { GET as audit } from "./audit/route";

let server: MongoMemoryServer;

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
  await Promise.all(
    [Post, Category, Tag, MediaAsset, User, RateLimit, EmailJob, OtpChallenge, Role, AuditLog].map(
      (model) =>
        (model as unknown as { deleteMany: (f: object) => Promise<unknown> }).deleteMany({}),
    ),
  );
  uploadImageToShopify.mockReset().mockResolvedValue({
    gid: "gid://shopify/MediaImage/1",
    url: "https://cdn.shopify.com/s/files/1/0001/fern.png",
    width: 800,
    height: 600,
  });
});

const content = (text = "Hello") => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const body = (over: Record<string, unknown> = {}) => ({
  title: "Caring for ferns",
  content: content(),
  categoryIds: [],
  tags: [],
  template: "classic",
  status: "draft",
  ...over,
});
const json = async (response: Response) => response.json();
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function upload(token: string, file: Blob, name: string, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", file, name);
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return uploadMedia(apiRequest("/api/admin/media", "POST", { token, raw: form }));
}

describe("who may do what", () => {
  const anonymous: [string, () => Promise<Response>][] = [
    ["GET posts", () => listPosts(apiRequest("/api/admin/posts", "GET"))],
    ["POST posts", () => createPost(apiRequest("/api/admin/posts", "POST", { body: body() }))],
    ["GET post", () => getPost(apiRequest("/api/admin/posts/64b7f0c2a1b2c3d4e5f60718", "GET"))],
    [
      "PUT post",
      () =>
        putPost(apiRequest("/api/admin/posts/64b7f0c2a1b2c3d4e5f60718", "PUT", { body: body() })),
    ],
    [
      "bulk",
      () =>
        bulk(
          apiRequest("/api/admin/posts/bulk", "POST", { body: { ids: ["x"], action: "trash" } }),
        ),
    ],
    ["GET categories", () => listCategories(apiRequest("/api/admin/categories", "GET"))],
    [
      "POST categories",
      () => createCategory(apiRequest("/api/admin/categories", "POST", { body: { name: "x" } })),
    ],
    ["GET tags", () => listTags(apiRequest("/api/admin/tags", "GET"))],
    ["GET media", () => listMedia(apiRequest("/api/admin/media", "GET"))],
  ];
  it.each(anonymous)("%s refuses anonymous callers", async (_name, call) => {
    expect((await call()).status).toBe(401);
  });

  it("an editor can write, publish and manage taxonomy and media, but can't trash or read the audit log", async () => {
    const { token } = await adminSession("ed@example.com", "editor");
    const created = await createPost(
      apiRequest("/api/admin/posts", "POST", { token, body: body({ status: "published" }) }),
    );
    expect(created.status).toBe(201);
    const id = (await json(created)).data.post.id as string;
    expect(
      (
        await createCategory(
          apiRequest("/api/admin/categories", "POST", { token, body: { name: "Care" } }),
        )
      ).status,
    ).toBe(201);
    expect((await upload(token, new Blob([PNG]), "a.png")).status).toBe(201);

    const trash = await bulk(
      apiRequest("/api/admin/posts/bulk", "POST", { token, body: { ids: [id], action: "trash" } }),
    );
    expect(trash.status).toBe(403);
    expect((await json(trash)).error.code).toBe("delete_denied");
    expect((await audit(apiRequest("/api/admin/audit", "GET", { token }))).status).toBe(403);
  });

  it("a custom writer role can draft but not publish, manage categories or upload media", async () => {
    await adminSession("boss@example.com", "super_admin");
    await Role.create({ key: "writer", name: "Writer", permissions: ["blog:read", "blog:write"] });
    const { token } = await adminSession("w@example.com", "writer");

    expect(
      (await createPost(apiRequest("/api/admin/posts", "POST", { token, body: body() }))).status,
    ).toBe(201);
    const publish = await createPost(
      apiRequest("/api/admin/posts", "POST", { token, body: body({ status: "published" }) }),
    );
    expect(publish.status).toBe(403);
    expect((await json(publish)).error.code).toBe("publish_denied");
    for (const call of [
      () =>
        createCategory(
          apiRequest("/api/admin/categories", "POST", { token, body: { name: "Nope" } }),
        ),
      () => listMedia(apiRequest("/api/admin/media", "GET", { token })),
      () => upload(token, new Blob([PNG]), "a.png"),
    ]) {
      const response = await call();
      expect(response.status).toBe(403);
      expect((await json(response)).error.code).toBe("permission_denied");
    }
  });

  it("refuses customers with 403 on the blog API", async () => {
    const { signAccessToken } = await import("@/server/auth/tokens");
    const sid = "sid-1";
    const customer = await User.create({
      email: "c@example.com",
      firstName: "C",
      lastName: "C",
      passwordHash: "x",
      sessions: [
        { sid, tokenHash: "h", createdAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) },
      ],
    });
    const token = await signAccessToken({ sub: String(customer._id), sid, role: "customer" });
    const response = await listPosts(apiRequest("/api/admin/posts", "GET", { token }));
    expect(response.status).toBe(403);
    expect((await json(response)).error.code).toBe("admin_required");
  });

  it("mutations need a same-origin request even with a valid token", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    for (const call of [
      () =>
        createPost(
          apiRequest("/api/admin/posts", "POST", {
            token,
            origin: "https://evil.example",
            body: body(),
          }),
        ),
      () =>
        bulk(
          apiRequest("/api/admin/posts/bulk", "POST", {
            token,
            origin: "https://evil.example",
            body: { ids: ["a"], action: "trash" },
          }),
        ),
      () =>
        createCategory(
          apiRequest("/api/admin/categories", "POST", {
            token,
            origin: "https://evil.example",
            body: { name: "x" },
          }),
        ),
      () =>
        upload(token, new Blob([PNG]), "a.png").then(async () =>
          uploadMedia(
            apiRequest("/api/admin/media", "POST", {
              token,
              origin: "https://evil.example",
              raw: new FormData(),
            }),
          ),
        ),
    ]) {
      expect((await call()).status).toBe(403);
    }
  });
});

describe("posts over HTTP", () => {
  it("runs the whole lifecycle: create, edit, publish, list, trash, restore, delete, with an audit trail", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const created = await createPost(
      apiRequest("/api/admin/posts", "POST", {
        token,
        body: body({ tags: ["Ferns"], template: "guide" }),
      }),
    );
    expect(created.status).toBe(201);
    const post = (await json(created)).data.post;
    expect(post).toMatchObject({
      status: "draft",
      slug: "caring-for-ferns",
      template: "guide",
      tags: ["Ferns"],
    });

    const fetched = await getPost(apiRequest(`/api/admin/posts/${post.id}`, "GET", { token }));
    expect((await json(fetched)).data.post.content.type).toBe("doc");

    const edited = await putPost(
      apiRequest(`/api/admin/posts/${post.id}`, "PUT", {
        token,
        body: body({ title: "Ferns, revised", status: "published", slug: "ferns-revised" }),
      }),
    );
    expect(edited.status).toBe(200);
    expect((await json(edited)).data.post).toMatchObject({
      status: "published",
      slug: "ferns-revised",
    });

    const list = await json(
      await listPosts(apiRequest("/api/admin/posts?status=published", "GET", { token })),
    );
    expect(list.data.posts).toHaveLength(1);
    expect(list.data.counts).toMatchObject({ all: 1, published: 1, draft: 0 });

    const trashed = await bulk(
      apiRequest("/api/admin/posts/bulk", "POST", {
        token,
        body: { ids: [post.id], action: "trash" },
      }),
    );
    expect((await json(trashed)).data.changed).toBe(1);
    expect(
      (await putPost(apiRequest(`/api/admin/posts/${post.id}`, "PUT", { token, body: body() })))
        .status,
    ).toBe(409);
    await bulk(
      apiRequest("/api/admin/posts/bulk", "POST", {
        token,
        body: { ids: [post.id], action: "restore" },
      }),
    );
    await bulk(
      apiRequest("/api/admin/posts/bulk", "POST", {
        token,
        body: { ids: [post.id], action: "trash" },
      }),
    );
    await bulk(
      apiRequest("/api/admin/posts/bulk", "POST", {
        token,
        body: { ids: [post.id], action: "delete" },
      }),
    );
    expect(await Post.countDocuments()).toBe(0);

    const trail = await json(
      await audit(apiRequest("/api/admin/audit?limit=100", "GET", { token })),
    );
    const actions = trail.data.entries.map((e: { action: string }) => e.action);
    for (const expected of [
      "post.created",
      "post.status_changed",
      "post.bulk_trash",
      "post.bulk_restore",
      "post.bulk_delete",
    ]) {
      expect(actions).toContain(expected);
    }
    expect(JSON.stringify(trail)).not.toContain("Hello");
  });

  it("rejects bad input with field errors and never a 500", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const send = (b: unknown) =>
      createPost(apiRequest("/api/admin/posts", "POST", { token, body: b }));

    const noTitle = await send(body({ title: "  " }));
    expect(noTitle.status).toBe(400);
    expect((await json(noTitle)).error.fields[0].path).toBe("title");

    for (const bad of [
      body({ content: { type: "doc", content: [{ type: "script" }] } }),
      body({
        content: {
          type: "doc",
          content: [{ type: "image", attrs: { src: "https://evil.example/a.png" } }],
        },
      }),
      body({ content: "<script>alert(1)</script>" }),
      body({ template: "hacker" }),
      body({ status: "trash" }),
      body({ slug: "Bad Slug!" }),
      body({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }),
      body({ categoryIds: ["nope"] }),
      body({ featuredImage: { url: "https://evil.example/a.png", alt: "x" } }),
      body({ status: "scheduled" }),
      body({ status: "scheduled", scheduledAt: "2001-01-01T00:00:00Z" }),
      { nonsense: true },
    ]) {
      const response = await send(bad);
      expect(response.status, JSON.stringify(bad).slice(0, 80)).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    }
    expect(await Post.countDocuments()).toBe(0);
  });

  it("limits the request body and answers 404 for unknown posts", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const huge = await createPost(
      apiRequest("/api/admin/posts", "POST", {
        token,
        body: body({ excerpt: "x".repeat(10), content: content("y".repeat(1_100_000)) }),
      }),
    );
    expect(huge.status).toBe(413);
    expect((await getPost(apiRequest("/api/admin/posts/not-an-id", "GET", { token }))).status).toBe(
      404,
    );
    expect(
      (await getPost(apiRequest("/api/admin/posts/64b7f0c2a1b2c3d4e5f60718", "GET", { token })))
        .status,
    ).toBe(404);
  });

  it("prevents two posts sharing a slug and reports it as a conflict", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    await createPost(
      apiRequest("/api/admin/posts", "POST", { token, body: body({ slug: "same" }) }),
    );
    const clash = await createPost(
      apiRequest("/api/admin/posts", "POST", { token, body: body({ slug: "same" }) }),
    );
    expect(clash.status).toBe(409);
    expect((await json(clash)).error.code).toBe("slug_taken");
  });
});

describe("categories and tags over HTTP", () => {
  it("creates a hierarchy, refuses cycles, deletes with re-filing, and lists tags", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const make = async (b: object) =>
      (
        await json(
          await createCategory(apiRequest("/api/admin/categories", "POST", { token, body: b })),
        )
      ).data.category;
    const parent = await make({ name: "Plant Care" });
    const child = await make({ name: "Watering", parentId: parent.id });

    const cycle = await patchCategory(
      apiRequest(`/api/admin/categories/${parent.id}`, "PATCH", {
        token,
        body: { parentId: child.id },
      }),
    );
    expect(cycle.status).toBe(400);
    expect((await json(cycle)).error.code).toBe("category_cycle");
    expect(
      (
        await patchCategory(
          apiRequest(`/api/admin/categories/${child.id}`, "PATCH", { token, body: {} }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await patchCategory(
          apiRequest(`/api/admin/categories/${child.id}`, "PATCH", {
            token,
            body: { name: "Water" },
          }),
        )
      ).status,
    ).toBe(200);

    await createPost(
      apiRequest("/api/admin/posts", "POST", {
        token,
        body: body({ categoryIds: [child.id], tags: ["Pet Safe"] }),
      }),
    );
    expect(
      (await deleteCategory(apiRequest(`/api/admin/categories/${child.id}`, "DELETE", { token })))
        .status,
    ).toBe(200);
    const categories = (
      await json(await listCategories(apiRequest("/api/admin/categories", "GET", { token })))
    ).data.categories;
    expect(categories.map((c: { name: string }) => c.name).sort()).toEqual([
      "Plant Care",
      "Uncategorized",
    ]);
    expect(categories.find((c: { isDefault: boolean }) => c.isDefault).totalCount).toBe(1);

    const defaultCategory = categories.find((c: { isDefault: boolean }) => c.isDefault);
    const refused = await deleteCategory(
      apiRequest(`/api/admin/categories/${defaultCategory.id}`, "DELETE", { token }),
    );
    expect(refused.status).toBe(409);
    expect(
      (await json(await listTags(apiRequest("/api/admin/tags", "GET", { token })))).data.tags[0]
        .name,
    ).toBe("Pet Safe");
  });
});

describe("media over HTTP", () => {
  it("uploads an image, lists it, and refuses deleting one that a post uses", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const done = await upload(token, new Blob([PNG], { type: "image/png" }), "Fern Photo.png", {
      alt: "A fern",
    });
    expect(done.status).toBe(201);
    const media = (await json(done)).data.media;
    expect(media).toMatchObject({
      filename: "fern-photo.png",
      alt: "A fern",
      url: "https://cdn.shopify.com/s/files/1/0001/fern.png",
    });
    expect(
      (await json(await listMedia(apiRequest("/api/admin/media", "GET", { token })))).data.total,
    ).toBe(1);

    await createPost(
      apiRequest("/api/admin/posts", "POST", {
        token,
        body: body({ featuredImage: { url: media.url, alt: "A fern" } }),
      }),
    );
    const blocked = await deleteMedia(
      apiRequest(`/api/admin/media/${media.id}`, "DELETE", { token }),
    );
    expect(blocked.status).toBe(409);
    expect((await json(blocked)).error.code).toBe("media_in_use");
  });

  it("refuses non-images, disguised files, missing files, wrong content types and oversized uploads", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>'], {
      type: "image/svg+xml",
    });
    const disguised = new Blob(["<script>alert(1)</script>"], { type: "image/png" });
    for (const [file, name] of [
      [svg, "a.svg"],
      [disguised, "a.png"],
    ] as const) {
      const response = await upload(token, file, name);
      expect(response.status).toBe(400);
      expect((await json(response)).error.code).toBe("unsupported_image");
    }
    expect(uploadImageToShopify).not.toHaveBeenCalled();

    const empty = await uploadMedia(
      apiRequest("/api/admin/media", "POST", { token, raw: new FormData() }),
    );
    expect((await json(empty)).error.code).toBe("file_required");
    const wrongType = await uploadMedia(
      apiRequest("/api/admin/media", "POST", { token, body: { file: "x" } }),
    );
    expect((await json(wrongType)).error.code).toBe("unsupported_media_type");
    const oversized = await uploadMedia(
      apiRequest("/api/admin/media", "POST", {
        token,
        raw: new FormData(),
        headers: { "content-length": String(6 * 1024 * 1024) },
      }),
    );
    expect(oversized.status).toBe(413);
  });

  it("answers 503 without leaking details when Shopify fails", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    uploadImageToShopify.mockRejectedValue(new Error("shpat_secret exploded"));
    const response = await upload(token, new Blob([PNG]), "a.png");
    expect(response.status).toBe(503);
    expect(JSON.stringify(await json(response))).not.toMatch(/shpat|exploded/);
  });
});
