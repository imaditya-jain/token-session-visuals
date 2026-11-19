import "server-only";

import { Schema, type Types } from "mongoose";

import { defineModel } from "@/server/db/define-model";

/**
 * Read-only mirrors of Shopify records, keyed by Shopify GID. Shopify stays the source of truth; these hold the
 * ids (and a little metadata) so our own features can reference products, collections and orders, and so a
 * webhook or backfill can be applied idempotently. They deliberately hold no addresses, phone numbers or emails.
 */

type Base = {
  /** Shopify GID, e.g. `gid://shopify/Product/123`. Unique. */
  gid: string;
  /** `updatedAt` reported by Shopify; an older copy never overwrites a newer one. */
  shopifyUpdatedAt: Date;
  syncedAt: Date;
  /** Set when Shopify reports the record deleted. The row is kept so references stay explainable. */
  deletedAt?: Date | undefined;
};

export type ShopifyProductRecord = Base & {
  handle: string;
  title: string;
  status: string;
  productType: string;
  tags: string[];
  variants: { gid: string; sku?: string | undefined; title: string }[];
  collectionGids: string[];
};

export type ShopifyCollectionRecord = Base & { handle: string; title: string };

export type ShopifyOrderRecord = Base & {
  _id: Types.ObjectId;
  /** Order name shown to the customer, e.g. `#1001`. */
  name: string;
  customerGid?: string | undefined;
  /** Our account that owns the order, when one matches (by Shopify customer GID or by email). */
  userId?: Types.ObjectId | undefined;
  /** Keyed hash of the order email so a guest order can be linked after the buyer registers. Not reversible. */
  emailKey?: string | undefined;
  financialStatus: string;
  fulfillmentStatus: string;
  cancelledAt?: Date | undefined;
  processedAt?: Date | undefined;
  currency: string;
  /** Exact decimal string from Shopify (no float arithmetic). */
  total: string;
  lineItems: {
    gid: string;
    title: string;
    quantity: number;
    productGid?: string | undefined;
    variantGid?: string | undefined;
  }[];
};

const baseFields = {
  gid: { type: String, required: true },
  shopifyUpdatedAt: { type: Date, required: true },
  syncedAt: { type: Date, required: true },
  deletedAt: { type: Date },
};

const productSchema = new Schema<ShopifyProductRecord>({
  ...baseFields,
  handle: { type: String, required: true },
  title: { type: String, required: true },
  status: { type: String, required: true },
  productType: { type: String, default: "" },
  tags: { type: [String], default: [] },
  variants: {
    type: [{ _id: false, gid: String, sku: String, title: String }],
    default: [],
  },
  collectionGids: { type: [String], default: [] },
});
productSchema.index({ gid: 1 }, { unique: true });
productSchema.index({ handle: 1 });
productSchema.index({ "variants.gid": 1 });

const collectionSchema = new Schema<ShopifyCollectionRecord>({
  ...baseFields,
  handle: { type: String, required: true },
  title: { type: String, required: true },
});
collectionSchema.index({ gid: 1 }, { unique: true });
collectionSchema.index({ handle: 1 });

const orderSchema = new Schema<ShopifyOrderRecord>({
  ...baseFields,
  name: { type: String, required: true },
  customerGid: { type: String },
  userId: { type: Schema.Types.ObjectId },
  emailKey: { type: String },
  financialStatus: { type: String, required: true },
  fulfillmentStatus: { type: String, required: true },
  cancelledAt: { type: Date },
  processedAt: { type: Date },
  currency: { type: String, required: true },
  total: { type: String, required: true },
  lineItems: {
    type: [
      {
        _id: false,
        gid: String,
        title: String,
        quantity: Number,
        productGid: String,
        variantGid: String,
      },
    ],
    default: [],
  },
});
orderSchema.index({ gid: 1 }, { unique: true });
orderSchema.index({ userId: 1, processedAt: -1 });
orderSchema.index({ customerGid: 1 });
orderSchema.index({ emailKey: 1 });

export const ShopifyProduct = defineModel<ShopifyProductRecord>("ShopifyProduct", productSchema);
export const ShopifyCollection = defineModel<ShopifyCollectionRecord>(
  "ShopifyCollection",
  collectionSchema,
);
export const ShopifyOrder = defineModel<ShopifyOrderRecord>("ShopifyOrder", orderSchema);
