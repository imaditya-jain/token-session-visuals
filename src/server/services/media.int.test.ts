// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const uploadImageToShopify = vi.fn();
const updateShopifyFileAlt = vi.fn();
const deleteShopifyFile = vi.fn();
vi.mock("@/server/shopify/files", () => ({
  uploadImageToShopify: (...a: unknown[]) => uploadImageToShopify(...a),
  updateShopifyFileAlt: (...a: unknown[]) => updateShopifyFileAlt(...a),
  deleteShopifyFile: (...a: unknown[]) => deleteShopifyFile(...a),
}));

import { parseRichText } from "@/lib/rich-text";
import { disconnectDb } from "@/server/db/connection";
import { MediaAsset, Post } from "@/server/db/models/blog";
import { User } from "@/server/db/models/user";
import { ShopifyError } from "@/server/shopify/client";
import { startTestDatabase } from "@/test/mongo";

import { createPost } from "./blog-admin";
import { deleteMedia, listMedia, MAX_UPLOAD_BYTES, updateMediaAlt, uploadMedia } from "./media";

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
  await Promise.all([MediaAsset.deleteMany({}), Post.deleteMany({}), User.deleteMany({})]);
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
    const first = await listMedia(1, 2);
    expect(first.total).toBe(3);
    expect(first.items.map((i) => i.filename)).toEqual(["img3.png", "img2.png"]);
    expect((await listMedia(2, 2)).items.map((i) => i.filename)).toEqual(["img1.png"]);
  });

  it("updates alt text in Shopify first, then locally", async () => {
    ok();
    const { id } = await uploadMedia(userId, { bytes: png(), originalName: "a.png" }, "old");
    expect((await updateMediaAlt(id, "new")).alt).toBe("new");
    expect(updateShopifyFileAlt).toHaveBeenCalledWith("gid://shopify/MediaImage/1", "new");

    updateShopifyFileAlt.mockRejectedValue(new Error("down"));
    await expect(updateMediaAlt(id, "again")).rejects.toMatchObject({ status: 503 });
    expect((await MediaAsset.findById(id).lean())?.alt).toBe("new");
    await expect(updateMediaAlt("nope", "x")).rejects.toMatchObject({ status: 404 });
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
