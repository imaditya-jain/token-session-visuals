// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const uploadImageToShopify = vi.fn();
const updateShopifyFileAlt = vi.fn();
const deleteShopifyFile = vi.fn();
const replaceShopifyFileImage = vi.fn();
vi.mock("@/server/shopify/files", () => ({
  replaceShopifyFileImage: (...a: unknown[]) => replaceShopifyFileImage(...a),
  uploadImageToShopify: (...a: unknown[]) => uploadImageToShopify(...a),
  updateShopifyFileAlt: (...a: unknown[]) => updateShopifyFileAlt(...a),
  deleteShopifyFile: (...a: unknown[]) => deleteShopifyFile(...a),
}));

import { parseRichText } from "@/lib/rich-text";
import { disconnectDb } from "@/server/db/connection";
import { MediaAsset, MediaFolder, Post } from "@/server/db/models/blog";
import { Campaign } from "@/server/db/models/campaign";
import { SiteSetting } from "@/server/db/models/site-setting";
import { User } from "@/server/db/models/user";
import { ShopifyError } from "@/server/shopify/client";
import { startTestDatabase } from "@/test/mongo";

import { createPost } from "./blog-admin";
import {
  createFolder,
  deleteFolder,
  deleteMedia,
  deleteUnused,
  getMedia,
  listFolders,
  listMedia,
  MAX_UPLOAD_BYTES,
  mediaSummary,
  moveMedia,
  renameFolder,
  replaceMedia,
  updateMedia,
  uploadMedia,
} from "./media";
import { mediaListQuerySchema } from "@/lib/media";

const list = (over: Record<string, unknown> = {}) => mediaListQuerySchema.parse(over);

let server: MongoMemoryServer;
let userId: string;

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
    MediaAsset.deleteMany({}),
    MediaFolder.deleteMany({}),
    Post.deleteMany({}),
    SiteSetting.deleteMany({}),
    Campaign.deleteMany({}),
    User.deleteMany({}),
  ]);
  userId = String(
    (
      await User.create({
        email: "ed@example.com",
        firstName: "E",
        lastName: "W",
        passwordHash: "x",
      })
    )._id,
  );
  uploadImageToShopify.mockReset();
  updateShopifyFileAlt.mockReset().mockResolvedValue(undefined);
  deleteShopifyFile.mockReset().mockResolvedValue(undefined);
  replaceShopifyFileImage.mockReset();
});

const png = (extra = 8) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(extra).fill(0)]);
const URL1 = "https://cdn.shopify.com/s/files/1/0001/fern.png";
const ok = () =>
  uploadImageToShopify.mockResolvedValue({
    gid: "gid://shopify/MediaImage/1",
    url: URL1,
    width: 800,
    height: 600,
  });

describe("uploadMedia", () => {
  it("validates by content, names the file safely, uploads and records the asset", async () => {
    ok();
    const view = await uploadMedia(
      userId,
      { bytes: png(), originalName: "My Fern Photo!!.JPG" },
      "A fern",
    );
    // The bytes are PNG, so the stored name and type follow the content, not the claimed ".JPG".
    expect(view).toMatchObject({
      filename: "my-fern-photo.png",
      mimeType: "image/png",
      alt: "A fern",
      url: URL1,
      width: 800,
      height: 600,
    });
    expect(uploadImageToShopify.mock.calls[0]?.[0]).toMatchObject({
      filename: "my-fern-photo.png",
      mimeType: "image/png",
    });
    expect(await MediaAsset.countDocuments()).toBe(1);
  });

  it("falls back to a neutral name when the original is unusable", async () => {
    ok();
    const view = await uploadMedia(userId, { bytes: png(), originalName: "../../etc/passwd" }, "");
    expect(view.filename).toBe("passwd.png");
    uploadImageToShopify.mockResolvedValue({
      gid: "gid://shopify/MediaImage/2",
      url: "https://cdn.shopify.com/s/files/2.png",
    });
    expect(
      (await uploadMedia(userId, { bytes: png(), originalName: "日本語.png" }, "")).filename,
    ).toBe("image.png");
  });

  it.each([
    [
      "an SVG",
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>'),
      "unsupported_image",
    ],
    [
      "HTML renamed to .png",
      new TextEncoder().encode("<html><script>alert(1)</script>"),
      "unsupported_image",
    ],
    ["an empty file", new Uint8Array(), "empty_file"],
  ])("refuses %s before touching Shopify", async (_label, bytes, code) => {
    await expect(uploadMedia(userId, { bytes, originalName: "x.png" }, "")).rejects.toMatchObject({
      code,
    });
    expect(uploadImageToShopify).not.toHaveBeenCalled();
  });

  it("refuses files over the size limit", async () => {
    await expect(
      uploadMedia(userId, { bytes: png(MAX_UPLOAD_BYTES), originalName: "big.png" }, ""),
    ).rejects.toMatchObject({ code: "file_too_large", status: 413 });
  });

  it("answers 503 and stores nothing when Shopify fails, without leaking its message", async () => {
    uploadImageToShopify.mockRejectedValue(
      new ShopifyError("Shopify stagedUploadsCreate: shpat_secret quota"),
    );
    const error = await uploadMedia(userId, { bytes: png(), originalName: "a.png" }, "").catch(
      (e) => e,
    );
    expect(error).toMatchObject({ status: 503, code: "media_unavailable" });
    expect(String(error.message)).not.toMatch(/shpat|quota/);
    expect(await MediaAsset.countDocuments()).toBe(0);
  });

  it("removes the Shopify file again if it can't be recorded", async () => {
    ok();
    await MediaAsset.create({
      gid: "gid://shopify/MediaImage/1",
      url: URL1,
      filename: "x.png",
      mimeType: "image/png",
      bytes: 1,
      createdBy: userId,
    });
    await expect(
      uploadMedia(userId, { bytes: png(), originalName: "a.png" }, ""),
    ).rejects.toBeTruthy();
    expect(deleteShopifyFile).toHaveBeenCalledWith("gid://shopify/MediaImage/1");
  });
});

describe("library", () => {
  it("lists newest first with pagination", async () => {
    for (let i = 1; i <= 3; i++) {
      uploadImageToShopify.mockResolvedValueOnce({
        gid: `gid://shopify/MediaImage/${i}`,
        url: `https://cdn.shopify.com/s/files/${i}.png`,
      });
      await uploadMedia(userId, { bytes: png(), originalName: `img${i}.png` }, "");
      await new Promise((r) => setTimeout(r, 3));
    }
    const first = await listMedia(list({ page: 1, perPage: 2 }));
    expect(first.total).toBe(3);
    expect(first.items.map((i) => i.filename)).toEqual(["img3.png", "img2.png"]);
    expect((await listMedia(list({ page: 2, perPage: 2 }))).items.map((i) => i.filename)).toEqual([
      "img1.png",
    ]);
  });

  it("updates alt text in Shopify first, then locally", async () => {
    ok();
    const { id } = await uploadMedia(userId, { bytes: png(), originalName: "a.png" }, "old");
    expect((await updateMedia(id, { alt: "new" })).alt).toBe("new");
    expect(updateShopifyFileAlt).toHaveBeenCalledWith("gid://shopify/MediaImage/1", "new");

    updateShopifyFileAlt.mockRejectedValue(new Error("down"));
    await expect(updateMedia(id, { alt: "again" })).rejects.toMatchObject({ status: 503 });
    expect((await MediaAsset.findById(id).lean())?.alt).toBe("new");
    await expect(updateMedia("nope", { alt: "x" })).rejects.toMatchObject({ status: 404 });
  });

  it("won't delete an image a post still uses (as featured image or inside the text)", async () => {
    ok();
    const { id } = await uploadMedia(userId, { bytes: png(), originalName: "a.png" }, "");
    const actor = { userId, canPublish: true, canDelete: true };
    const base = {
      categoryIds: [],
      tags: [],
      template: "classic" as const,
      status: "draft" as const,
    };

    const featured = await createPost(actor, {
      ...base,
      title: "Featured",
      content: parseRichText({ type: "doc", content: [{ type: "paragraph" }] }),
      featuredImage: { url: URL1, alt: "x" },
    });
    await expect(deleteMedia(id)).rejects.toMatchObject({ code: "media_in_use", status: 409 });
    await Post.deleteOne({ _id: featured.id });

    await createPost(actor, {
      ...base,
      title: "Inline",
      content: parseRichText({
        type: "doc",
        content: [{ type: "image", attrs: { src: URL1, alt: "x" } }],
      }),
    });
    await expect(deleteMedia(id)).rejects.toMatchObject({ code: "media_in_use" });
    expect(deleteShopifyFile).not.toHaveBeenCalled();

    await Post.deleteMany({});
    await deleteMedia(id);
    expect(deleteShopifyFile).toHaveBeenCalledWith("gid://shopify/MediaImage/1");
    expect(await MediaAsset.countDocuments()).toBe(0);
  });

  it("keeps the record when Shopify refuses the delete", async () => {
    ok();
    const { id } = await uploadMedia(userId, { bytes: png(), originalName: "a.png" }, "");
    deleteShopifyFile.mockRejectedValue(new Error("down"));
    await expect(deleteMedia(id)).rejects.toMatchObject({ status: 503 });
    expect(await MediaAsset.countDocuments()).toBe(1);
  });
});

const upload = async (n: number, name = `img${n}.png`) => {
  uploadImageToShopify.mockResolvedValueOnce({
    gid: `gid://shopify/MediaImage/${n}`,
    url: `https://cdn.shopify.com/s/files/1/0001/img${n}.png?v=${1000 + n}`,
    width: 100,
    height: 80,
  });
  return uploadMedia(userId, { bytes: png(), originalName: name }, "");
};

describe("usage", () => {
  it("finds a picture in page content, the header/footer and campaigns, not only in posts", async () => {
    const a = await upload(1);
    await SiteSetting.create({
      key: "page:about",
      draft: { story: { image: { src: a.url, alt: "" } } },
      published: {},
    });
    await SiteSetting.create({ key: "chrome", draft: { footer: { logo: a.url } }, published: {} });
    await Campaign.create({
      name: "Note",
      subject: "s",
      design: "card.classic",
      status: "sent",
      content: { image: { src: a.url } },
    });
    const { usages, media } = await getMedia(a.id);
    expect(media.usageCount).toBe(3);
    expect(usages.map((u) => u.type).sort()).toEqual(["campaign", "page", "site"]);
    expect(usages.find((u) => u.type === "page")?.href).toBe("/admin/site/pages/about");
    await expect(deleteMedia(a.id)).rejects.toMatchObject({ code: "media_in_use" });
  });

  it("recognises a picture by its address even when the version suffix differs", async () => {
    const a = await upload(1);
    await SiteSetting.create({
      key: "page:home",
      draft: {
        hero: { image: { src: "https://cdn.shopify.com/s/files/1/0001/img1.png?v=1", alt: "" } },
      },
    });
    expect((await getMedia(a.id)).usages).toHaveLength(1);
  });

  it("lists only unused pictures and deletes only those, keeping the ones in use", async () => {
    const used = await upload(1);
    const free1 = await upload(2);
    const free2 = await upload(3);
    await SiteSetting.create({
      key: "page:home",
      draft: { hero: { image: { src: used.url, alt: "" } } },
    });
    const unused = await listMedia(list({ usage: "unused" }));
    expect(unused.items.map((i) => i.id).sort()).toEqual([free1.id, free2.id].sort());
    expect(unused.total).toBe(2);
    expect((await mediaSummary()).unused).toBe(2);

    const result = await deleteUnused([used.id, free1.id, free2.id]);
    expect(result).toEqual({ deleted: 2, kept: 1 });
    expect(await MediaAsset.countDocuments()).toBe(1);
    expect(deleteShopifyFile).toHaveBeenCalledTimes(2);
  });
});

describe("replace", () => {
  it("replaces the picture in place and updates every place that uses it", async () => {
    const a = await upload(1);
    const actor = { userId, canPublish: true, canDelete: true };
    const post = await createPost(actor, {
      categoryIds: [],
      tags: [],
      template: "classic",
      status: "draft",
      title: "With picture",
      content: parseRichText({
        type: "doc",
        content: [{ type: "image", attrs: { src: a.url, alt: "x" } }],
      }),
      featuredImage: { url: a.url, alt: "x" },
    });
    await SiteSetting.create({
      key: "page:about",
      draft: { story: { image: { src: a.url, alt: "" } } },
      published: { story: { image: { src: a.url, alt: "" } } },
    });
    await Campaign.create({
      name: "Sent",
      subject: "s",
      design: "card.classic",
      status: "sent",
      content: { image: { src: a.url } },
    });
    await Campaign.create({
      name: "Draft",
      subject: "s",
      design: "card.classic",
      status: "draft",
      content: { image: { src: a.url } },
    });

    const newUrl = "https://cdn.shopify.com/s/files/1/0001/img1.png?v=9999";
    replaceShopifyFileImage.mockResolvedValue({
      gid: "gid://shopify/MediaImage/1",
      url: newUrl,
      width: 60,
      height: 45,
    });
    const done = await replaceMedia(a.id, { bytes: png(20), originalName: "whatever.png" });

    expect(done.media.url).toBe(newUrl);
    expect(done.media).toMatchObject({ width: 60, height: 45, filename: "img1.png" });
    expect(done.media.replacedAt).not.toBeNull();
    expect(done.updatedReferences).toBe(3);
    expect(replaceShopifyFileImage).toHaveBeenCalledWith(
      "gid://shopify/MediaImage/1",
      expect.objectContaining({ filename: "img1.png", mimeType: "image/png" }),
    );

    const savedPost = await Post.findById(post.id).lean();
    expect(savedPost?.featuredImage?.url).toBe(newUrl);
    expect(JSON.stringify(savedPost?.content)).toContain(newUrl);
    expect(JSON.stringify(savedPost?.content)).not.toContain("v=1001");
    expect(savedPost?.contentHtml).toContain(encodeURIComponent(newUrl));
    const page = await SiteSetting.findOne({ key: "page:about" }).lean();
    expect(JSON.stringify([page?.draft, page?.published])).not.toContain("v=1001");
    expect(JSON.stringify(page?.published)).toContain(newUrl);
    // A campaign that was already sent is a record and keeps what it showed; a draft follows the new picture.
    expect(JSON.stringify((await Campaign.findOne({ name: "Sent" }).lean())?.content)).toContain(
      "v=1001",
    );
    expect(JSON.stringify((await Campaign.findOne({ name: "Draft" }).lean())?.content)).toContain(
      newUrl,
    );
  });

  it("leaves everything as it was when Shopify refuses, and checks the file's content", async () => {
    const a = await upload(1);
    replaceShopifyFileImage.mockRejectedValue(new Error("down"));
    await expect(replaceMedia(a.id, { bytes: png(), originalName: "x.png" })).rejects.toMatchObject(
      { status: 503 },
    );
    expect((await MediaAsset.findById(a.id).lean())?.url).toBe(a.url);
    await expect(
      replaceMedia(a.id, { bytes: new Uint8Array([1, 2, 3, 4]), originalName: "x.png" }),
    ).rejects.toMatchObject({ code: "unsupported_image" });
    await expect(
      replaceMedia(a.id, { bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1), originalName: "x.png" }),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      replaceMedia("nope", { bytes: png(), originalName: "x.png" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("folders", () => {
  it("creates unique folders, files pictures in them, filters, and never deletes pictures with a folder", async () => {
    const [a, b, c] = [await upload(1), await upload(2), await upload(3)];
    const blog = await createFolder(userId, "Blog");
    await expect(createFolder(userId, "blog")).rejects.toMatchObject({
      code: "folder_exists",
      status: 409,
    });
    expect(await moveMedia([a.id, b.id], blog.id)).toBe(2);

    expect((await listMedia(list({ folder: blog.id }))).items.map((i) => i.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
    expect((await listMedia(list({ folder: "none" }))).items.map((i) => i.id)).toEqual([c.id]);
    expect(await listFolders()).toEqual([{ id: blog.id, name: "Blog", count: 2 }]);
    expect(await mediaSummary()).toMatchObject({
      total: 3,
      unfiled: 1,
      folders: [{ name: "Blog", count: 2 }],
    });

    await renameFolder(blog.id, "Journal");
    expect((await listFolders())[0]?.name).toBe("Journal");
    await expect(moveMedia([a.id], "64b7f0c2a1b2c3d4e5f60718")).rejects.toMatchObject({
      code: "folder_not_found",
    });

    await deleteFolder(blog.id);
    expect(await MediaAsset.countDocuments()).toBe(3);
    expect(await MediaAsset.countDocuments({ folderId: { $exists: true } })).toBe(0);
  });

  it("uploads into a folder, searches by name or alt and moves a picture out again", async () => {
    const folder = await createFolder(userId, "Shop");
    uploadImageToShopify.mockResolvedValueOnce({
      gid: "gid://shopify/MediaImage/9",
      url: "https://cdn.shopify.com/s/files/1/0001/fern-pot.png?v=1",
    });
    const up = await uploadMedia(
      userId,
      { bytes: png(), originalName: "Fern Pot.png" },
      "A pot",
      folder.id,
    );
    expect(up.folderId).toBe(folder.id);
    expect((await listMedia(list({ search: "fern" }))).total).toBe(1);
    expect((await listMedia(list({ search: "a pot" }))).total).toBe(1);
    expect((await listMedia(list({ search: "(.*" }))).total).toBe(0);
    expect((await updateMedia(up.id, { folderId: null })).folderId).toBeNull();
  });
});
