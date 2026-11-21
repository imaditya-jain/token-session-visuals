import "server-only";

import { createHmac } from "node:crypto";

import type { Model, Types } from "mongoose";
import type { z } from "zod";

import type { MirrorResource } from "@/lib/shopify-gid";
import { authEnv } from "@/server/config/env";
import { connectDb } from "@/server/db/connection";
import { ShopifyCollection, ShopifyOrder, ShopifyProduct } from "@/server/db/models/shopify-mirror";
import { User } from "@/server/db/models/user";
import { orderEvents } from "@/server/services/order-events";
import { notifyOrderEvents } from "@/server/services/notifications";
import { adminQuery } from "@/server/shopify/admin";
import {
  MIRROR_COLLECTION_QUERY,
  MIRROR_COLLECTIONS_QUERY,
  MIRROR_ORDER_QUERY,
  MIRROR_ORDERS_QUERY,
  MIRROR_PRODUCT_QUERY,
  MIRROR_PRODUCTS_QUERY,
} from "@/server/shopify/mirror-queries";
import {
  collectionResponse,
  collectionsResponse,
  orderResponse,
  ordersResponse,
  productResponse,
  productsResponse,
  type CollectionNode,
  type OrderNode,
  type ProductNode,
} from "@/server/shopify/mirror-schemas";

export const BACKFILL_PAGE_SIZE = 50;

const run = async <S extends z.ZodType>(
  schema: S,
  query: string,
  variables: Record<string, unknown>,
): Promise<z.infer<S>> => schema.parse(await adminQuery(query, variables));

/**
 * Keyed hash of an email, used to link a guest order to an account that registers later without storing the
 * address. Domain-separated from every other keyed hash in the app.
 */
export const emailKey = (email: string): string =>
  createHmac("sha256", authEnv().REFRESH_TOKEN_SECRET)
    .update(`order-email:${email.trim().toLowerCase()}`)
    .digest("hex");

type AnyModel = Model<Record<string, unknown>>;

/** One generic handle for the three mirror collections; they share the GID/updatedAt/deletedAt fields. */
const modelFor = (resource: MirrorResource): AnyModel => {
  switch (resource) {
    case "product":
      return ShopifyProduct as unknown as AnyModel;
    case "collection":
      return ShopifyCollection as unknown as AnyModel;
    case "order":
      return ShopifyOrder as unknown as AnyModel;
  }
};

/**
 * Upserts by GID unless we already hold a newer copy. The filter only matches an older (or equal) copy, so a
 * stale delivery would try to insert a duplicate GID; the unique index rejects it and we treat that as "skip".
 */
async function upsertNewest(
  resource: MirrorResource,
  gid: string,
  updatedAt: Date,
  fields: Record<string, unknown>,
): Promise<void> {
  const model = modelFor(resource);
  try {
    await model.updateOne(
      { gid, shopifyUpdatedAt: { $lte: updatedAt } },
      {
        $set: { ...fields, gid, shopifyUpdatedAt: updatedAt, syncedAt: new Date() },
        $unset: { deletedAt: 1 },
      },
      { upsert: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}

const mapProduct = (node: ProductNode) => ({
  handle: node.handle,
  title: node.title,
  status: node.status,
  productType: node.productType,
  tags: node.tags,
  variants: node.variants.nodes.map((variant) => ({
    gid: variant.id,
    ...(variant.sku ? { sku: variant.sku } : {}),
    title: variant.title,
  })),
  collectionGids: node.collections.nodes.map((collection) => collection.id),
});

async function saveProduct(node: ProductNode): Promise<void> {
  await upsertNewest("product", node.id, new Date(node.updatedAt), mapProduct(node));
}

async function saveCollection(node: CollectionNode): Promise<void> {
  await upsertNewest("collection", node.id, new Date(node.updatedAt), {
    handle: node.handle,
    title: node.title,
  });
}

/** Only an account whose mailbox is proven may be linked to an order (the email is the only link for guests). */
async function owningUser(
  customerGid: string | undefined,
  email: string | null,
): Promise<Types.ObjectId | undefined> {
  const byCustomer = customerGid
    ? await User.findOne({ shopifyCustomerId: customerGid, emailVerifiedAt: { $exists: true } })
        .select("_id")
        .lean()
    : null;
  if (byCustomer) return byCustomer._id;
  if (!email) return undefined;
  const byEmail = await User.findOne({
    email: email.trim().toLowerCase(),
    emailVerifiedAt: { $exists: true },
  })
    .select("_id")
    .lean();
  return byEmail?._id;
}

async function saveOrder(node: OrderNode): Promise<void> {
  const customerGid = node.customer?.id;
  const userId = await owningUser(customerGid, node.email);
  const fields: Record<string, unknown> = {
    name: node.name,
    financialStatus: node.displayFinancialStatus ?? "UNKNOWN",
    fulfillmentStatus: node.displayFulfillmentStatus,
    currency: node.currentTotalPriceSet.shopMoney.currencyCode,
    total: node.currentTotalPriceSet.shopMoney.amount,
    lineItems: node.lineItems.nodes.map((line) => ({
      gid: line.id,
      title: line.title,
      quantity: line.quantity,
      ...(line.product ? { productGid: line.product.id } : {}),
      ...(line.variant ? { variantGid: line.variant.id } : {}),
    })),
    ...(customerGid ? { customerGid } : {}),
    ...(userId ? { userId } : {}),
    ...(node.email ? { emailKey: emailKey(node.email) } : {}),
    ...(node.processedAt ? { processedAt: new Date(node.processedAt) } : {}),
    ...(node.cancelledAt ? { cancelledAt: new Date(node.cancelledAt) } : {}),
  };
  const updatedAt = new Date(node.updatedAt);
  const previous = await ShopifyOrder.findOne({ gid: node.id })
    .select("financialStatus fulfillmentStatus cancelledAt shopifyUpdatedAt")
    .lean();
  await upsertNewest("order", node.id, updatedAt, fields);

  // Tell the customer what changed, unless this read is older than what we already hold (out-of-order delivery).
  const stale = previous !== null && previous.shopifyUpdatedAt.getTime() > updatedAt.getTime();
  if (!userId || stale) return;
  const events = orderEvents(previous, {
    financialStatus: node.displayFinancialStatus ?? "UNKNOWN",
    fulfillmentStatus: node.displayFulfillmentStatus,
    cancelledAt: node.cancelledAt ? new Date(node.cancelledAt) : undefined,
    processedAt: node.processedAt ? new Date(node.processedAt) : undefined,
  });
  await notifyOrderEvents({ gid: node.id, name: node.name, userId }, events);
}

/** Marks a record deleted in Shopify (kept, flagged). Does nothing if we never held it. */
export async function markDeleted(resource: MirrorResource, gid: string): Promise<void> {
  await connectDb();
  await modelFor(resource).updateOne(
    { gid },
    { $set: { deletedAt: new Date(), syncedAt: new Date() } },
  );
}

/**
 * Re-reads one record from Shopify and stores it. Reading fresh (instead of trusting a webhook body) makes
 * delivery order irrelevant and keeps one mapping for webhooks and backfill. Returns "deleted" when Shopify
 * no longer has it.
 */
export async function mirrorOne(
  resource: MirrorResource,
  gid: string,
): Promise<"synced" | "deleted"> {
  await connectDb();
  const found = await fetchOne(resource, gid);
  if (!found) {
    await markDeleted(resource, gid);
    return "deleted";
  }
  await found.save();
  return "synced";
}

async function fetchOne(
  resource: MirrorResource,
  gid: string,
): Promise<{ save: () => Promise<void> } | null> {
  switch (resource) {
    case "product": {
      const { product } = await run(productResponse, MIRROR_PRODUCT_QUERY, { id: gid });
      return product ? { save: () => saveProduct(product) } : null;
    }
    case "collection": {
      const { collection } = await run(collectionResponse, MIRROR_COLLECTION_QUERY, { id: gid });
      return collection ? { save: () => saveCollection(collection) } : null;
    }
    case "order": {
      const { order } = await run(orderResponse, MIRROR_ORDER_QUERY, { id: gid });
      return order ? { save: () => saveOrder(order) } : null;
    }
  }
}

/** Stores one page of a resource (the full backfill walks pages via chained jobs). */
export async function mirrorPage(
  resource: MirrorResource,
  cursor: string | null,
): Promise<{ count: number; nextCursor: string | null }> {
  await connectDb();
  const variables = { first: BACKFILL_PAGE_SIZE, after: cursor };
  switch (resource) {
    case "product": {
      const { products } = await run(productsResponse, MIRROR_PRODUCTS_QUERY, variables);
      for (const node of products.nodes) await saveProduct(node);
      return {
        count: products.nodes.length,
        nextCursor: products.pageInfo.hasNextPage ? products.pageInfo.endCursor : null,
      };
    }
    case "collection": {
      const { collections } = await run(collectionsResponse, MIRROR_COLLECTIONS_QUERY, variables);
      for (const node of collections.nodes) await saveCollection(node);
      return {
        count: collections.nodes.length,
        nextCursor: collections.pageInfo.hasNextPage ? collections.pageInfo.endCursor : null,
      };
    }
    case "order": {
      const { orders } = await run(ordersResponse, MIRROR_ORDERS_QUERY, variables);
      for (const node of orders.nodes) await saveOrder(node);
      return {
        count: orders.nodes.length,
        nextCursor: orders.pageInfo.hasNextPage ? orders.pageInfo.endCursor : null,
      };
    }
  }
}

/**
 * Attaches already-mirrored orders to an account once its mailbox is verified: by Shopify customer GID, or by the
 * keyed email hash for earlier guest orders. Never touches orders that already belong to someone.
 */
export async function linkOrdersToUser(user: {
  _id: Types.ObjectId;
  email: string;
  shopifyCustomerId?: string | undefined;
  emailVerifiedAt?: Date | undefined;
}): Promise<void> {
  if (!user.emailVerifiedAt) return;
  await connectDb();
  await ShopifyOrder.updateMany(
    {
      userId: { $exists: false },
      $or: [
        { emailKey: emailKey(user.email) },
        ...(user.shopifyCustomerId ? [{ customerGid: user.shopifyCustomerId }] : []),
      ],
    },
    { $set: { userId: user._id } },
  );
}
