import "server-only";

import { Types } from "mongoose";

import type {
  MediaFolderView,
  MediaItem,
  MediaListQuery,
  MediaPage,
  MediaSummary,
  MediaUsage,
} from "@/lib/media";
import { slugify } from "@/lib/slug";
import { sniffImage } from "@/server/blog/image-sniff";
import { connectDb } from "@/server/db/connection";
import { MediaAsset, MediaFolder, type MediaAssetRecord } from "@/server/db/models/blog";
import { AppError, badRequest, conflict, notFound } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { ShopifyError } from "@/server/shopify/client";
import { adminConfigured } from "@/server/queue/producers";
import {
  deleteShopifyFile,
  replaceShopifyFileImage,
  updateShopifyFileAlt,
  uploadImageToShopify,
} from "@/server/shopify/files";

import { loadSources, rewriteReferences, usageIn } from "./media-usage";

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

const view = (asset: MediaAssetRecord, usageCount = 0): MediaItem => ({
  id: String(asset._id),
  url: asset.url,
  alt: asset.alt,
  filename: asset.filename,
  mimeType: asset.mimeType,
  bytes: asset.bytes,
  ...(asset.width ? { width: asset.width } : {}),
  ...(asset.height ? { height: asset.height } : {}),
  createdAt: asset.createdAt.toISOString(),
  folderId: asset.folderId ? String(asset.folderId) : null,
  replacedAt: asset.replacedAt?.toISOString() ?? null,
  usageCount,
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

const oid = (id: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(id)) throw notFound("Media not found", "media_not_found");
  return new Types.ObjectId(id);
};

async function checkedImage(file: { bytes: Uint8Array; originalName: string }) {
  if (file.bytes.byteLength === 0) throw badRequest("The file is empty.", "empty_file");
  if (file.bytes.byteLength > MAX_UPLOAD_BYTES)
    throw new AppError(413, "file_too_large", "Images can be up to 4 MB.");
  const kind = sniffImage(file.bytes);
  if (!kind) throw badRequest("Upload a JPEG, PNG, WebP or GIF image.", "unsupported_image");
  return kind;
}

async function assertFolder(
  folderId: string | null | undefined,
): Promise<Types.ObjectId | undefined> {
  if (!folderId) return undefined;
  const id = oid(folderId);
  if (!(await MediaFolder.exists({ _id: id })))
    throw notFound("Folder not found", "folder_not_found");
  return id;
}

export async function uploadMedia(
  userId: string,
  file: { bytes: Uint8Array; originalName: string },
  alt: string,
  folderId?: string | null,
): Promise<MediaItem> {
  const kind = await checkedImage(file);
  await connectDb();
  const folder = await assertFolder(folderId);

  // Take the base name first (browsers may send a path), then drop the extension: the type comes from the bytes.
  const baseName = file.originalName.split(/[\\/]/).pop() ?? "";
  const stem = slugify(baseName.replace(/\.[^.]*$/, "")) || "image";
  const filename = `${stem}.${kind.extension}`;
  const uploaded = await viaShopify(() =>
    uploadImageToShopify({ bytes: file.bytes, filename, mimeType: kind.mimeType }, alt),
  );

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
      ...(folder ? { folderId: folder } : {}),
      createdBy: new Types.ObjectId(userId),
    });
    return view(created.toObject());
  } catch (error) {
    // The file exists in Shopify but we can't record it: remove it rather than orphan it.
    await deleteShopifyFile(uploaded.gid).catch(() => undefined);
    throw error;
  }
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const LIBRARY_CAP = 2000;

export async function listMedia(query: MediaListQuery): Promise<MediaPage> {
  await connectDb();
  const filter: Record<string, unknown> = {};
  if (query.folder === "none") filter["folderId"] = { $exists: false };
  else if (query.folder !== "all") filter["folderId"] = oid(query.folder);
  if (query.search) {
    const rx = { $regex: escapeRegex(query.search), $options: "i" };
    filter["$or"] = [{ filename: rx }, { alt: rx }];
  }

  if (query.usage === "unused") {
    // "Unused" needs every picture checked against the content, so the (small) library is read once.
    const all = await MediaAsset.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(LIBRARY_CAP)
      .lean();
    const usage = usageIn(
      await loadSources(),
      all.map((a) => a.url),
    );
    const unused = all.filter((a) => (usage.get(a.url) ?? []).length === 0);
    const start = (query.page - 1) * query.perPage;
    return {
      items: unused.slice(start, start + query.perPage).map((a) => view(a, 0)),
      total: unused.length,
    };
  }

  const [rows, total] = await Promise.all([
    MediaAsset.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.perPage)
      .limit(query.perPage)
      .lean(),
    MediaAsset.countDocuments(filter),
  ]);
  const usage = usageIn(
    await loadSources(),
    rows.map((r) => r.url),
  );
  return { items: rows.map((r) => view(r, (usage.get(r.url) ?? []).length)), total };
}

export async function getMedia(id: string): Promise<{ media: MediaItem; usages: MediaUsage[] }> {
  await connectDb();
  const asset = await MediaAsset.findById(oid(id)).lean();
  if (!asset) throw notFound("Media not found", "media_not_found");
  const usages = usageIn(await loadSources(), [asset.url]).get(asset.url) ?? [];
  return { media: view(asset, usages.length), usages };
}

export async function updateMedia(
  id: string,
  patch: { alt?: string | undefined; folderId?: string | null | undefined },
): Promise<MediaItem> {
  await connectDb();
  const asset = await MediaAsset.findById(oid(id)).lean();
  if (!asset) throw notFound("Media not found", "media_not_found");
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (patch.alt !== undefined && patch.alt !== asset.alt) {
    await viaShopify(() => updateShopifyFileAlt(asset.gid, patch.alt as string));
    set["alt"] = patch.alt;
  }
  if (patch.folderId !== undefined) {
    const folder = await assertFolder(patch.folderId);
    if (folder) set["folderId"] = folder;
    else unset["folderId"] = 1;
  }
  if (Object.keys(set).length || Object.keys(unset).length) {
    await MediaAsset.updateOne(
      { _id: asset._id },
      {
        ...(Object.keys(set).length ? { $set: set } : {}),
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      },
    );
  }
  const next = await MediaAsset.findById(asset._id).lean();
  return view(next ?? asset);
}

/** Replaces the picture in place (the same library entry and the same Shopify file) and updates every place using it. */
export async function replaceMedia(
  id: string,
  file: { bytes: Uint8Array; originalName: string },
): Promise<{ media: MediaItem; updatedReferences: number }> {
  const kind = await checkedImage(file);
  await connectDb();
  const asset = await MediaAsset.findById(oid(id)).lean();
  if (!asset) throw notFound("Media not found", "media_not_found");
  const stem = asset.filename.replace(/\.[^.]*$/, "") || "image";
  const filename = `${stem}.${kind.extension}`;
  const replaced = await viaShopify(() =>
    replaceShopifyFileImage(asset.gid, { bytes: file.bytes, filename, mimeType: kind.mimeType }),
  );
  await MediaAsset.updateOne(
    { _id: asset._id },
    {
      $set: {
        url: replaced.url,
        filename,
        mimeType: kind.mimeType,
        bytes: file.bytes.byteLength,
        replacedAt: new Date(),
        ...(replaced.width ? { width: replaced.width } : {}),
        ...(replaced.height ? { height: replaced.height } : {}),
      },
    },
  );
  const updatedReferences = await rewriteReferences(asset.url, replaced.url);
  const next = await MediaAsset.findById(asset._id).lean();
  return { media: view(next ?? asset), updatedReferences };
}

function inUse(usages: MediaUsage[]): AppError {
  const names = usages
    .slice(0, 3)
    .map((u) => u.label)
    .join(", ");
  const more = usages.length > 3 ? ` and ${usages.length - 3} more` : "";
  return conflict(`This image is used in ${names}${more}. Remove it there first.`, "media_in_use");
}

/** A picture that is still used anywhere can't be deleted (it would leave a broken picture on a live page or email). */
export async function deleteMedia(id: string): Promise<void> {
  await connectDb();
  const asset = await MediaAsset.findById(oid(id)).lean();
  if (!asset) throw notFound("Media not found", "media_not_found");
  const usages = usageIn(await loadSources(), [asset.url]).get(asset.url) ?? [];
  if (usages.length > 0) throw inUse(usages);
  await viaShopify(() => deleteShopifyFile(asset.gid));
  await MediaAsset.deleteOne({ _id: asset._id });
}

/** Deletes the chosen pictures that nothing uses; the ones in use are kept and counted. */
export async function deleteUnused(ids: string[]): Promise<{ deleted: number; kept: number }> {
  await connectDb();
  const assets = await MediaAsset.find({ _id: { $in: ids.map(oid) } }).lean();
  const usage = usageIn(
    await loadSources(),
    assets.map((a) => a.url),
  );
  let deleted = 0;
  let kept = 0;
  for (const asset of assets) {
    if ((usage.get(asset.url) ?? []).length > 0) {
      kept++;
      continue;
    }
    await viaShopify(() => deleteShopifyFile(asset.gid));
    await MediaAsset.deleteOne({ _id: asset._id });
    deleted++;
  }
  return { deleted, kept };
}

export async function moveMedia(ids: string[], folderId: string | null): Promise<number> {
  await connectDb();
  const folder = await assertFolder(folderId);
  const filter = { _id: { $in: ids.map(oid) } };
  const result = await MediaAsset.updateMany(
    filter,
    folder ? { $set: { folderId: folder } } : { $unset: { folderId: 1 } },
  );
  return result.modifiedCount;
}

// ---- Folders -----------------------------------------------------------------------------------------------------

export async function listFolders(): Promise<MediaFolderView[]> {
  await connectDb();
  const [folders, counts] = await Promise.all([
    MediaFolder.find({}).collation({ locale: "en", strength: 2 }).sort({ name: 1 }).lean(),
    MediaAsset.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { folderId: { $exists: true } } },
      { $group: { _id: "$folderId", n: { $sum: 1 } } },
    ]),
  ]);
  return folders.map((f) => ({
    id: String(f._id),
    name: f.name,
    count: counts.find((c) => String(c._id) === String(f._id))?.n ?? 0,
  }));
}

const duplicate = (error: unknown) => (error as { code?: number }).code === 11000;

export async function createFolder(userId: string, name: string): Promise<MediaFolderView> {
  await connectDb();
  try {
    const folder = await MediaFolder.create({ name, createdBy: new Types.ObjectId(userId) });
    return { id: String(folder._id), name: folder.name, count: 0 };
  } catch (error) {
    if (duplicate(error))
      throw conflict("A folder with that name already exists.", "folder_exists");
    throw error;
  }
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await connectDb();
  try {
    const result = await MediaFolder.updateOne(
      { _id: oid(id) },
      { $set: { name } },
      { collation: { locale: "en", strength: 2 } },
    );
    if (result.matchedCount === 0) throw notFound("Folder not found", "folder_not_found");
  } catch (error) {
    if (duplicate(error))
      throw conflict("A folder with that name already exists.", "folder_exists");
    throw error;
  }
}

/** Deleting a folder never deletes pictures: they go back to "not in a folder". */
export async function deleteFolder(id: string): Promise<void> {
  await connectDb();
  const folderId = oid(id);
  const removed = await MediaFolder.findOneAndDelete({ _id: folderId });
  if (!removed) throw notFound("Folder not found", "folder_not_found");
  await MediaAsset.updateMany({ folderId }, { $unset: { folderId: 1 } });
}

export async function mediaSummary(): Promise<MediaSummary> {
  await connectDb();
  const [assets, folders] = await Promise.all([
    MediaAsset.find({}, { url: 1, bytes: 1, folderId: 1 }).limit(LIBRARY_CAP).lean(),
    listFolders(),
  ]);
  const usage = usageIn(
    await loadSources(),
    assets.map((a) => a.url),
  );
  return {
    total: assets.length,
    bytes: assets.reduce((sum, a) => sum + a.bytes, 0),
    unused: assets.filter((a) => (usage.get(a.url) ?? []).length === 0).length,
    unfiled: assets.filter((a) => !a.folderId).length,
    folders,
  };
}
