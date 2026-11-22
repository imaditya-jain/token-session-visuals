import "server-only";

import { Types } from "mongoose";

import type { MediaView } from "@/lib/blog-types";
import { slugify } from "@/lib/slug";
import { sniffImage } from "@/server/blog/image-sniff";
import { connectDb } from "@/server/db/connection";
import { MediaAsset, Post, type MediaAssetRecord } from "@/server/db/models/blog";
import { AppError, badRequest, conflict, notFound } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { ShopifyError } from "@/server/shopify/client";
import { adminConfigured } from "@/server/queue/producers";
import {
  deleteShopifyFile,
  updateShopifyFileAlt,
  uploadImageToShopify,
} from "@/server/shopify/files";

/** Vercel functions accept request bodies up to 4.5 MB, so uploads are capped just under that. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const unavailable = () =>
  new AppError(
    503,
    "media_unavailable",
    "Media storage is unavailable right now. Please try again.",
    {
      "Retry-After": "30",
    },
  );

const view = (asset: MediaAssetRecord): MediaView => ({
  id: String(asset._id),
  url: asset.url,
  alt: asset.alt,
  filename: asset.filename,
  mimeType: asset.mimeType,
  bytes: asset.bytes,
  ...(asset.width ? { width: asset.width } : {}),
  ...(asset.height ? { height: asset.height } : {}),
  createdAt: asset.createdAt.toISOString(),
});

/** Runs a Shopify call; any Shopify or network failure becomes a clean 503 (details go to the log only). */
async function viaShopify<T>(run: () => Promise<T>): Promise<T> {
  if (!adminConfigured()) throw unavailable();
  try {
    return await run();
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error : String(error) },
      "Shopify Files call failed",
    );
    if (error instanceof ShopifyError || error instanceof Error) throw unavailable();
    throw error;
  }
}

export async function uploadMedia(
  userId: string,
  file: { bytes: Uint8Array; originalName: string },
  alt: string,
): Promise<MediaView> {
  if (file.bytes.byteLength === 0) throw badRequest("The file is empty.", "empty_file");
  if (file.bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new AppError(413, "file_too_large", "Images can be up to 4 MB.");
  const kind = sniffImage(file.bytes);
  if (!kind) throw badRequest("Upload a JPEG, PNG, WebP or GIF image.", "unsupported_image");

  // Take the base name first (browsers may send a path), then drop the extension: the type comes from the bytes.
  const baseName = file.originalName.split(/[\\/]/).pop() ?? "";
  const stem = slugify(baseName.replace(/\.[^.]*$/, "")) || "image";
  const filename = `${stem}.${kind.extension}`;
  const uploaded = await viaShopify(() =>
    uploadImageToShopify({ bytes: file.bytes, filename, mimeType: kind.mimeType }, alt),
  );

  await connectDb();
  try {
    const created = await MediaAsset.create({
      gid: uploaded.gid,
      url: uploaded.url,
      alt,
      filename,
      mimeType: kind.mimeType,
      bytes: file.bytes.byteLength,
      ...(uploaded.width ? { width: uploaded.width } : {}),
      ...(uploaded.height ? { height: uploaded.height } : {}),
      createdBy: new Types.ObjectId(userId),
    });
    return view(created.toObject());
  } catch (error) {
    // The file exists in Shopify but we can't record it: remove it rather than orphan it.
    await deleteShopifyFile(uploaded.gid).catch(() => undefined);
    throw error;
  }
}

export async function listMedia(
  page: number,
  perPage: number,
): Promise<{ items: MediaView[]; total: number }> {
  await connectDb();
  const [rows, total] = await Promise.all([
    MediaAsset.find({})
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean(),
    MediaAsset.countDocuments(),
  ]);
  return { items: rows.map(view), total };
}

export async function updateMediaAlt(id: string, alt: string): Promise<MediaView> {
  await connectDb();
  if (!Types.ObjectId.isValid(id)) throw notFound("Media not found", "media_not_found");
  const asset = await MediaAsset.findById(id).lean();
  if (!asset) throw notFound("Media not found", "media_not_found");
  await viaShopify(() => updateShopifyFileAlt(asset.gid, alt));
  await MediaAsset.updateOne({ _id: asset._id }, { $set: { alt } });
  return view({ ...asset, alt });
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** An image still used by a post can't be deleted (it would leave a broken picture on a live page). */
export async function deleteMedia(id: string): Promise<void> {
  await connectDb();
  if (!Types.ObjectId.isValid(id)) throw notFound("Media not found", "media_not_found");
  const asset = await MediaAsset.findById(id).lean();
  if (!asset) throw notFound("Media not found", "media_not_found");

  const used = await Post.exists({
    status: { $ne: "trash" },
    $or: [
      { "featuredImage.url": asset.url },
      { contentHtml: { $regex: escapeRegex(encodeURIComponent(asset.url)) } },
    ],
  });
  if (used)
    throw conflict("This image is used by a post. Remove it from the post first.", "media_in_use");

  await viaShopify(() => deleteShopifyFile(asset.gid));
  await MediaAsset.deleteOne({ _id: asset._id });
}
