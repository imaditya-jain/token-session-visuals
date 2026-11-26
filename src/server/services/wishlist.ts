import "server-only";

import { Types } from "mongoose";

import { getProduct, getProducts } from "@/data/catalog";
import type { Product } from "@/lib/types";
import { connectDb } from "@/server/db/connection";
import { Wishlist, WISHLIST_LIMIT } from "@/server/db/models/wishlist";
import { AppError } from "@/server/http/errors";

/** Same shape as catalogue handles: lowercase letters, digits and hyphens. */
export const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const id = (userId: string) => new Types.ObjectId(userId);

export async function listWishlistHandles(userId: string): Promise<string[]> {
  await connectDb();
  const record = await Wishlist.findOne({ userId: id(userId) }).lean();
  return record?.handles ?? [];
}

/** Adds a product that exists in the catalogue. Idempotent: adding twice keeps one entry. */
export async function addToWishlist(userId: string, handle: string): Promise<string[]> {
  if (!HANDLE_PATTERN.test(handle) || !(await getProduct(handle))) {
    throw new AppError(404, "product_not_found", "We couldn't find that product.");
  }
  await connectDb();
  const current = await listWishlistHandles(userId);
  if (current.includes(handle)) return current;
  if (current.length >= WISHLIST_LIMIT) {
    throw new AppError(
      409,
      "wishlist_full",
      `Your wishlist can hold ${WISHLIST_LIMIT} plants. Remove one to add another.`,
    );
  }
  const next = [handle, ...current];
  await Wishlist.updateOne(
    { userId: id(userId) },
    { $set: { handles: next, updatedAt: new Date() } },
    { upsert: true },
  );
  return next;
}

export async function removeFromWishlist(userId: string, handle: string): Promise<string[]> {
  await connectDb();
  const record = await Wishlist.findOneAndUpdate(
    { userId: id(userId) },
    { $pull: { handles: handle }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  ).lean();
  return record?.handles ?? [];
}

/** The saved products with live prices and stock, in the order they were saved. Unlisted products are skipped. */
export async function listWishlistProducts(userId: string): Promise<Product[]> {
  const handles = await listWishlistHandles(userId);
  if (handles.length === 0) return [];
  const bySlug = new Map((await getProducts()).map((product) => [product.slug, product]));
  return handles.flatMap((handle) => {
    const product = bySlug.get(handle);
    return product ? [product] : [];
  });
}
