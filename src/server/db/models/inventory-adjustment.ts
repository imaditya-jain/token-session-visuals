import "server-only";

import { Schema, type Types } from "mongoose";

import { defineModel } from "@/server/db/define-model";

/**
 * A stock change made through the admin. Shopify's API does not offer a history of past adjustments, so this
 * ledger is the record of who changed what from here (changes made elsewhere in Shopify are not in it).
 */
export type InventoryAdjustmentRecord = {
  _id: Types.ObjectId;
  inventoryItemId: string;
  variantId: string | null;
  productId: string | null;
  productTitle: string;
  variantTitle: string;
  sku: string;
  locationId: string;
  locationName: string;
  delta: number;
  quantityAfter: number | null;
  reason: string;
  note: string;
  actorId: Types.ObjectId;
  actorName: string;
  shopifyGroupId: string | null;
  createdAt: Date;
};

const schema = new Schema<InventoryAdjustmentRecord>({
  inventoryItemId: { type: String, required: true, index: true },
  variantId: { type: String, default: null },
  productId: { type: String, default: null },
  productTitle: { type: String, default: "", maxlength: 255 },
  variantTitle: { type: String, default: "", maxlength: 255 },
  sku: { type: String, default: "", maxlength: 255 },
  locationId: { type: String, required: true },
  locationName: { type: String, default: "", maxlength: 255 },
  delta: { type: Number, required: true },
  quantityAfter: { type: Number, default: null },
  reason: { type: String, required: true, maxlength: 40 },
  note: { type: String, default: "", maxlength: 300 },
  actorId: { type: Schema.Types.ObjectId, required: true },
  actorName: { type: String, required: true, maxlength: 160 },
  shopifyGroupId: { type: String, default: null },
  createdAt: { type: Date, required: true, default: () => new Date() },
});
schema.index({ createdAt: -1 });

export const InventoryAdjustment = defineModel<InventoryAdjustmentRecord>(
  "InventoryAdjustment",
  schema,
);
