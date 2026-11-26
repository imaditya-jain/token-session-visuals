import "server-only";

import { Schema, type Types } from "mongoose";

import { defineModel } from "@/server/db/define-model";

export const WISHLIST_LIMIT = 100;

export type WishlistRecord = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** Product handles (the catalogue's public key), newest first. Prices and stock are always read live. */
  handles: string[];
  updatedAt: Date;
};

const wishlistSchema = new Schema<WishlistRecord>({
  userId: { type: Schema.Types.ObjectId, required: true, unique: true },
  handles: { type: [String], default: [] },
  updatedAt: { type: Date, required: true, default: () => new Date() },
});

export const Wishlist = defineModel<WishlistRecord>("Wishlist", wishlistSchema);
