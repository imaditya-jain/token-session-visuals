import "server-only";

import { z } from "zod";

import type { CreateProductInput, ProductDetail, ProductPatch, VariantInput } from "@/lib/products";
import { connectDb } from "@/server/db/connection";
import { InventoryAdjustment } from "@/server/db/models/inventory-adjustment";
import { SiteSetting } from "@/server/db/models/site-setting";
import { sanitizePolicyHtml } from "@/server/content/sanitize";
import { AppError, badRequest, notFound } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { adminConfigured } from "@/server/queue/producers";
import * as shopify from "@/server/shopify/product-admin";
import { Types } from "mongoose";

/**
 * Runs a Shopify call. A refusal from Shopify (its own validation) becomes a 422 carrying Shopify's merchant-facing
 * message; an outage or an unexpected response shape becomes a clean 503/502 with no internals. Never reports
 * success for something that failed.
 */
export async function viaShopify<T>(run: () => Promise<T>): Promise<T> {
  if (!adminConfigured()) {
    throw new AppError(
      503,
      "shopify_not_configured",
      "Shopify isn't connected. Check the Admin API settings.",
    );
  }
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof shopify.ShopifyUserError) {
      throw new AppError(422, "shopify_rejected", error.message);
    }
    if (error instanceof z.ZodError) {
      logger.error({ issues: error.issues.slice(0, 3) }, "Unexpected Shopify response shape");
      throw new AppError(
        502,
        "shopify_unexpected",
        "Shopify answered in a way we didn't expect. Please try again.",
      );
    }
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      "Shopify call failed",
    );
    throw new AppError(
      503,
      "shopify_unavailable",
      "Shopify is unavailable right now. Please try again.",
      { "Retry-After": "30" },
    );
  }
}

const cleanHtml = (html: string): string => sanitizePolicyHtml(html);

function sanitized<T extends ProductPatch>(input: T): T {
  return input.descriptionHtml === undefined
    ? input
    : { ...input, descriptionHtml: cleanHtml(input.descriptionHtml) };
}

export const listCollections = () => viaShopify(() => shopify.listCollections());
export const listLocations = () => viaShopify(() => shopify.listLocations());

export async function readProduct(id: string): Promise<ProductDetail> {
  const product = await viaShopify(() => shopify.getProduct(id));
  if (!product) throw notFound("Product not found", "product_not_found");
  return { ...product, descriptionHtml: cleanHtml(product.descriptionHtml) };
}

export async function fetchProducts(options: Parameters<typeof shopify.listProducts>[0]) {
  return viaShopify(() => shopify.listProducts(options));
}

const optionNamesOf = (product: ProductDetail): string[] => product.options.map((o) => o.name);

/**
 * Creates a product with its options and variants. Shopify makes one starter variant itself; it is reshaped into the
 * first requested variant and the rest are added. If any step fails the product is deleted again, so a failed
 * create never leaves a half-built product in the shop.
 */
export async function createProduct(input: CreateProductInput): Promise<ProductDetail> {
  return viaShopify(async () => {
    const { id } = await shopify.createProduct(sanitized(input.product), input.options);
    try {
      const created = await shopify.getProduct(id);
      if (!created) throw new shopify.ShopifyUserError("Shopify did not return the new product.");
      const names = created.options.map((o) => o.name);
      const starter = created.variants[0];
      const [first, ...rest] = input.variants;
      if (starter && first) await shopify.updateVariants(id, [{ ...first, id: starter.id }], names);
      // Variants beyond the starter; one whose option values the starter already has would clash, so it is skipped.
      const key = (values: string[]) => values.join("\u0000");
      const taken = new Set(created.variants.map((v) => key(v.optionValues)));
      taken.delete(key(starter?.optionValues ?? []));
      const toCreate = rest.filter((v) => !taken.has(key(v.optionValues)));
      await shopify.createVariants(id, toCreate, names);
      // The starter variant took the option values Shopify picked; align it with what was asked for.
      if (
        starter &&
        first &&
        key(starter.optionValues) !== key(first.optionValues) &&
        input.options.length > 0
      ) {
        await shopify.updateVariants(id, [{ ...first, id: starter.id }], names);
      }
      // Customers only see a product that is published on the sales channels, so a new product goes on all of them.
      await shopify.ensurePublished(id);
      const done = await shopify.getProduct(id);
      if (!done) throw new shopify.ShopifyUserError("Shopify did not return the new product.");
      return done;
    } catch (error) {
      await shopify.deleteProduct(id).catch((cleanup) => {
        logger.error(
          { err: String(cleanup), productId: id },
          "Could not remove a half-created product",
        );
      });
      throw error;
    }
  });
}

export async function updateProduct(id: string, patch: ProductPatch): Promise<ProductDetail> {
  return viaShopify(async () => {
    let collections: { join: string[]; leave: string[] } | undefined;
    if (patch.collectionIds) {
      const current = await shopify.getProduct(id);
      if (!current) throw notFound("Product not found", "product_not_found");
      const have = new Set(current.collections.map((c) => c.id));
      const want = new Set(patch.collectionIds);
      collections = {
        join: patch.collectionIds.filter((c) => !have.has(c)),
        leave: [...have].filter((c) => !want.has(c)),
      };
    }
    const { collectionIds: _ignored, ...fields } = patch;
    void _ignored;
    await shopify.updateProduct(id, sanitized(fields), collections);
    // Making a product Active is only half of going on sale; it must also be published on the channels.
    if (fields.status === "ACTIVE") await shopify.ensurePublished(id);
    const product = await shopify.getProduct(id);
    if (!product) throw notFound("Product not found", "product_not_found");
    return product;
  });
}

/** Sets exactly which sales channels the product is published on: adds the missing ones, withdraws the rest. */
export async function setChannels(productId: string, channelIds: string[]): Promise<ProductDetail> {
  return viaShopify(async () => {
    const { all, published } = await shopify.getChannelState(productId);
    const unknown = channelIds.filter((id) => !all.includes(id));
    if (unknown.length)
      throw badRequest("One of those sales channels doesn't exist.", "channel_not_found");
    await shopify.publishToChannels(
      productId,
      channelIds.filter((id) => !published.includes(id)),
    );
    await shopify.unpublishFromChannels(
      productId,
      published.filter((id) => !channelIds.includes(id)),
    );
    const next = await shopify.getProduct(productId);
    if (!next) throw notFound("Product not found", "product_not_found");
    return next;
  });
}

export async function archiveProduct(id: string, archived: boolean): Promise<void> {
  await viaShopify(() => shopify.updateProduct(id, { status: archived ? "ARCHIVED" : "DRAFT" }));
}

export async function deleteProduct(id: string): Promise<void> {
  await viaShopify(() => shopify.deleteProduct(id));
}

/** Saves a set of variants: those with an id are updated, those without are created. */
export async function saveVariants(
  productId: string,
  variants: VariantInput[],
): Promise<ProductDetail> {
  return viaShopify(async () => {
    const product = await shopify.getProduct(productId);
    if (!product) throw notFound("Product not found", "product_not_found");
    const names = optionNamesOf(product);
    for (const v of variants) {
      if (v.optionValues.length !== names.length) {
        throw badRequest("Give each variant one value for every option.", "variant_options");
      }
    }
    const known = new Set(product.variants.map((v) => v.id));
    const updates = variants.filter((v): v is VariantInput & { id: string } => v.id !== undefined);
    for (const v of updates)
      if (!known.has(v.id))
        throw badRequest("A variant doesn't belong to this product.", "variant_not_found");
    await shopify.updateVariants(productId, updates, names);
    await shopify.createVariants(
      productId,
      variants.filter((v) => v.id === undefined),
      names,
    );
    const next = await shopify.getProduct(productId);
    if (!next) throw notFound("Product not found", "product_not_found");
    return next;
  });
}

export async function removeVariants(
  productId: string,
  variantIds: string[],
): Promise<ProductDetail> {
  return viaShopify(async () => {
    const product = await shopify.getProduct(productId);
    if (!product) throw notFound("Product not found", "product_not_found");
    const known = new Set(product.variants.map((v) => v.id));
    if (variantIds.some((id) => !known.has(id)))
      throw badRequest("A variant doesn't belong to this product.", "variant_not_found");
    if (variantIds.length >= product.variants.length) {
      throw badRequest(
        "A product needs at least one variant. Delete the product instead.",
        "last_variant",
      );
    }
    await shopify.deleteVariants(productId, variantIds);
    const next = await shopify.getProduct(productId);
    if (!next) throw notFound("Product not found", "product_not_found");
    return next;
  });
}

export async function addOption(
  productId: string,
  option: { name: string; values: string[] },
): Promise<ProductDetail> {
  return viaShopify(async () => {
    await shopify.addOption(productId, option);
    const next = await shopify.getProduct(productId);
    if (!next) throw notFound("Product not found", "product_not_found");
    return next;
  });
}

export async function updateOption(
  productId: string,
  option: { id: string; name?: string | undefined; addValues?: string[] | undefined },
): Promise<ProductDetail> {
  return viaShopify(async () => {
    await shopify.updateOption(productId, option);
    const next = await shopify.getProduct(productId);
    if (!next) throw notFound("Product not found", "product_not_found");
    return next;
  });
}

export async function deleteOption(productId: string, optionId: string): Promise<ProductDetail> {
  return viaShopify(async () => {
    await shopify.deleteOption(productId, optionId);
    const next = await shopify.getProduct(productId);
    if (!next) throw notFound("Product not found", "product_not_found");
    return next;
  });
}

export async function addImages(
  productId: string,
  images: { url: string; alt: string }[],
): Promise<ProductDetail> {
  return viaShopify(async () => {
    await shopify.addImages(productId, images);
    const next = await shopify.getProduct(productId);
    if (!next) throw notFound("Product not found", "product_not_found");
    return next;
  });
}

export async function removeImages(productId: string, mediaIds: string[]): Promise<ProductDetail> {
  return viaShopify(async () => {
    await shopify.deleteImages(productId, mediaIds);
    const next = await shopify.getProduct(productId);
    if (!next) throw notFound("Product not found", "product_not_found");
    return next;
  });
}

export async function reorderImages(productId: string, mediaIds: string[]): Promise<ProductDetail> {
  return viaShopify(async () => {
    await shopify.reorderImages(productId, mediaIds);
    const next = await shopify.getProduct(productId);
    if (!next) throw notFound("Product not found", "product_not_found");
    return next;
  });
}

// ---- Inventory -----------------------------------------------------------------------------------------------------

const SETTINGS_KEY = "inventory";
export const DEFAULT_LOW_STOCK = 5;

export async function getLowStockThreshold(): Promise<number> {
  await connectDb();
  const doc = await SiteSetting.findOne({ key: SETTINGS_KEY }, { published: 1 }).lean();
  const value = (doc?.published as { lowStockThreshold?: unknown } | undefined)?.lowStockThreshold;
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : DEFAULT_LOW_STOCK;
}

export async function setLowStockThreshold(
  actorId: string,
  lowStockThreshold: number,
): Promise<number> {
  await connectDb();
  const value = { lowStockThreshold };
  await SiteSetting.updateOne(
    { key: SETTINGS_KEY },
    {
      $set: {
        draft: value,
        published: value,
        publishedAt: new Date(),
        updatedBy: new Types.ObjectId(actorId),
      },
      $setOnInsert: { key: SETTINGS_KEY },
    },
    { upsert: true },
  );
  return lowStockThreshold;
}

export async function lowStock(options: { soldOutOnly: boolean; after?: string | undefined }) {
  const threshold = options.soldOutOnly ? 0 : await getLowStockThreshold();
  const page = await viaShopify(() =>
    shopify.listLowStock({ maxQuantity: threshold, after: options.after }),
  );
  return { ...page, threshold };
}

export type AdjustInput = {
  inventoryItemId: string;
  locationId: string;
  delta: number;
  reason: string;
  note: string;
};

/** Changes stock at one location in Shopify, then records who did it. The ledger is only written after Shopify agreed. */
export async function adjustStock(actor: { id: string; name: string }, input: AdjustInput) {
  const outcome = await viaShopify(async () => {
    const context = await shopify.getInventoryContext(input.inventoryItemId, input.locationId);
    if (!context.inventoryItem || !context.location)
      throw badRequest("That stock item or location doesn't exist.", "inventory_not_found");
    if (!context.inventoryItem.tracked) {
      throw badRequest(
        "Stock isn't tracked for this variant. Turn on 'Track inventory' on the product first.",
        "not_tracked",
      );
    }
    const result = await shopify.adjustAvailable(input);
    return { context, result };
  });

  await connectDb();
  const { context, result } = outcome;
  const entry = await InventoryAdjustment.create({
    inventoryItemId: input.inventoryItemId,
    variantId: context.inventoryItem?.variant?.id ?? null,
    productId: context.inventoryItem?.variant?.product.id ?? null,
    productTitle: context.inventoryItem?.variant?.product.title ?? "",
    variantTitle: context.inventoryItem?.variant?.title ?? "",
    sku: context.inventoryItem?.variant?.sku ?? "",
    locationId: input.locationId,
    locationName: context.location?.name ?? "",
    delta: input.delta,
    quantityAfter: result.quantityAfter,
    reason: input.reason,
    note: input.note,
    actorId: new Types.ObjectId(actor.id),
    actorName: actor.name,
    shopifyGroupId: result.groupId,
  });
  return { id: String(entry._id), quantityAfter: result.quantityAfter };
}

export async function stockAt(
  inventoryItemId: string,
  locationId: string,
  available: number,
): Promise<void> {
  await viaShopify(() => shopify.activateAtLocation(inventoryItemId, locationId, available));
}

export type AdjustmentEntry = {
  id: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  locationName: string;
  delta: number;
  quantityAfter: number | null;
  reason: string;
  note: string;
  actorName: string;
  createdAt: string;
};

export async function adjustmentHistory(options: {
  inventoryItemId?: string | undefined;
  page: number;
  perPage: number;
}) {
  await connectDb();
  const filter = options.inventoryItemId ? { inventoryItemId: options.inventoryItemId } : {};
  const [rows, total] = await Promise.all([
    InventoryAdjustment.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((options.page - 1) * options.perPage)
      .limit(options.perPage)
      .lean(),
    InventoryAdjustment.countDocuments(filter),
  ]);
  return {
    total,
    items: rows.map((r): AdjustmentEntry => ({
      id: String(r._id),
      productTitle: r.productTitle,
      variantTitle: r.variantTitle,
      sku: r.sku,
      locationName: r.locationName,
      delta: r.delta,
      quantityAfter: r.quantityAfter,
      reason: r.reason,
      note: r.note,
      actorName: r.actorName,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
