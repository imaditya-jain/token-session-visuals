import "server-only";

import { z } from "zod";

import type {
  CollectionOption,
  InventoryLevelView,
  InventoryPolicy,
  LocationView,
  ProductDetail,
  ProductInput,
  ProductPatch,
  ProductListItem,
  ProductListPage,
  ProductStatus,
  StockRow,
  VariantInput,
  VariantView,
  WeightUnit,
} from "@/lib/products";

import { adminQuery } from "./admin";

/** Shopify refused a change and said why (its messages are written for merchants, so they are shown as they are). */
export class ShopifyUserError extends Error {
  constructor(
    message: string,
    readonly fields: string[] = [],
  ) {
    super(message);
    this.name = "ShopifyUserError";
  }
}

const userErrorsSchema = z.array(
  z.object({ field: z.array(z.string()).nullable().optional(), message: z.string() }),
);

function assertOk(errors: z.infer<typeof userErrorsSchema> | undefined): void {
  if (errors && errors.length > 0) {
    throw new ShopifyUserError(
      errors.map((e) => e.message).join(" "),
      errors.flatMap((e) => e.field ?? []),
    );
  }
}

const run = async <S extends z.ZodType>(
  schema: S,
  query: string,
  variables: Record<string, unknown>,
) => schema.parse(await adminQuery(query, variables)) as z.infer<S>;

// ---- Reading -----------------------------------------------------------------------------------------------------

const money = z.object({ amount: z.string(), currencyCode: z.string() });

const productListResponse = z.object({
  products: z.object({
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
    nodes: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        handle: z.string(),
        status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]),
        vendor: z.string(),
        productType: z.string(),
        tags: z.array(z.string()),
        totalInventory: z.number().nullable(),
        tracksInventory: z.boolean(),
        updatedAt: z.string(),
        variantsCount: z.object({ count: z.number() }).nullable(),
        featuredMedia: z
          .object({
            preview: z.object({ image: z.object({ url: z.string() }).nullable() }).nullable(),
          })
          .nullable(),
        priceRangeV2: z.object({ minVariantPrice: money, maxVariantPrice: money }),
      }),
    ),
  }),
});

const LIST_PRODUCTS = /* GraphQL */ `
  query ListProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        title
        handle
        status
        vendor
        productType
        tags
        totalInventory
        tracksInventory
        updatedAt
        variantsCount {
          count
        }
        featuredMedia {
          preview {
            image {
              url
            }
          }
        }
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
          maxVariantPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

/** Shopify's search syntax: quotes, backslashes and colons are neutralised so a search box can't inject filters. */
export function searchFilter(
  search: string | undefined,
  status: ProductStatus | undefined,
): string | undefined {
  const parts: string[] = [];
  const term = (search ?? "")
    .replace(/["\\:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (term) parts.push(`(title:*${term}* OR sku:${term.replace(/\s/g, "")}*)`);
  if (status) parts.push(`status:${status.toLowerCase()}`);
  return parts.length ? parts.join(" ") : undefined;
}

export async function listProducts(options: {
  search?: string | undefined;
  status?: ProductStatus | undefined;
  after?: string | undefined;
  first?: number;
}): Promise<ProductListPage> {
  const data = await run(productListResponse, LIST_PRODUCTS, {
    first: options.first ?? 20,
    after: options.after ?? null,
    query: searchFilter(options.search, options.status) ?? null,
  });
  const { nodes, pageInfo } = data.products;
  return {
    items: nodes.map((node): ProductListItem => ({
      id: node.id,
      title: node.title,
      handle: node.handle,
      status: node.status,
      vendor: node.vendor,
      productType: node.productType,
      tags: node.tags,
      imageUrl: node.featuredMedia?.preview?.image?.url ?? null,
      totalInventory: node.totalInventory,
      tracksInventory: node.tracksInventory,
      variantCount: node.variantsCount?.count ?? 0,
      priceMin: node.priceRangeV2.minVariantPrice.amount,
      priceMax: node.priceRangeV2.maxVariantPrice.amount,
      currency: node.priceRangeV2.minVariantPrice.currencyCode,
      updatedAt: node.updatedAt,
    })),
    nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
  };
}

const weightUnit = z.enum(["GRAMS", "KILOGRAMS", "OUNCES", "POUNDS"]);

const variantNode = z.object({
  id: z.string(),
  title: z.string(),
  sku: z.string().nullable(),
  barcode: z.string().nullable(),
  price: z.string(),
  compareAtPrice: z.string().nullable(),
  taxable: z.boolean(),
  inventoryPolicy: z.enum(["DENY", "CONTINUE"]),
  selectedOptions: z.array(z.object({ name: z.string(), value: z.string() })),
  media: z.object({ nodes: z.array(z.object({ id: z.string() })) }),
  inventoryItem: z.object({
    id: z.string(),
    tracked: z.boolean(),
    requiresShipping: z.boolean(),
    unitCost: z.object({ amount: z.string() }).nullable(),
    measurement: z
      .object({ weight: z.object({ value: z.number(), unit: weightUnit }).nullable() })
      .nullable(),
    inventoryLevels: z.object({
      nodes: z.array(
        z.object({
          id: z.string(),
          location: z.object({ id: z.string(), name: z.string() }),
          quantities: z.array(z.object({ name: z.string(), quantity: z.number() })),
        }),
      ),
    }),
  }),
});

const channelsFragment = z.object({
  publications: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string() })) }),
});

const productDetailResponse = channelsFragment.extend({
  product: z
    .object({
      id: z.string(),
      title: z.string(),
      handle: z.string(),
      descriptionHtml: z.string(),
      status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]),
      vendor: z.string(),
      productType: z.string(),
      tags: z.array(z.string()),
      updatedAt: z.string(),
      seo: z.object({ title: z.string().nullable(), description: z.string().nullable() }),
      options: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          position: z.number(),
          values: z.array(z.string()),
        }),
      ),
      media: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            alt: z.string().nullable(),
            image: z
              .object({
                url: z.string(),
                width: z.number().nullable(),
                height: z.number().nullable(),
              })
              .nullable()
              .optional(),
          }),
        ),
      }),
      collections: z.object({ nodes: z.array(z.object({ id: z.string(), title: z.string() })) }),
      resourcePublicationsV2: z.object({
        nodes: z.array(
          z.object({ isPublished: z.boolean(), publication: z.object({ id: z.string() }) }),
        ),
      }),
      variants: z.object({ nodes: z.array(variantNode) }),
    })
    .nullable(),
  shop: z.object({ currencyCode: z.string() }),
});

const GET_PRODUCT = /* GraphQL */ `
  query GetProduct($id: ID!) {
    shop {
      currencyCode
    }
    publications(first: 50) {
      nodes {
        id
        name
      }
    }
    product(id: $id) {
      id
      title
      handle
      descriptionHtml
      status
      vendor
      productType
      tags
      updatedAt
      seo {
        title
        description
      }
      options {
        id
        name
        position
        values
      }
      media(first: 50) {
        nodes {
          id
          alt
          ... on MediaImage {
            image {
              url
              width
              height
            }
          }
        }
      }
      collections(first: 50) {
        nodes {
          id
          title
        }
      }
      resourcePublicationsV2(first: 50) {
        nodes {
          isPublished
          publication {
            id
          }
        }
      }
      variants(first: 100) {
        nodes {
          id
          title
          sku
          barcode
          price
          compareAtPrice
          taxable
          inventoryPolicy
          selectedOptions {
            name
            value
          }
          media(first: 1) {
            nodes {
              id
            }
          }
          inventoryItem {
            id
            tracked
            requiresShipping
            unitCost {
              amount
            }
            measurement {
              weight {
                value
                unit
              }
            }
            inventoryLevels(first: 20) {
              nodes {
                id
                location {
                  id
                  name
                }
                quantities(names: ["available", "on_hand", "committed", "incoming", "reserved"]) {
                  name
                  quantity
                }
              }
            }
          }
        }
      }
    }
  }
`;

const qty = (quantities: { name: string; quantity: number }[], name: string): number =>
  quantities.find((q) => q.name === name)?.quantity ?? 0;

export async function getProduct(id: string): Promise<ProductDetail | null> {
  const { product, shop, publications } = await run(productDetailResponse, GET_PRODUCT, { id });
  if (!product) return null;
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    descriptionHtml: product.descriptionHtml,
    status: product.status,
    vendor: product.vendor,
    productType: product.productType,
    tags: product.tags,
    seoTitle: product.seo.title ?? "",
    seoDescription: product.seo.description ?? "",
    options: [...product.options].sort((a, b) => a.position - b.position),
    media: product.media.nodes.flatMap((m) =>
      m.image
        ? [
            {
              id: m.id,
              alt: m.alt ?? "",
              url: m.image.url,
              width: m.image.width,
              height: m.image.height,
            },
          ]
        : [],
    ),
    collections: product.collections.nodes,
    channels: publications.nodes.map((channel) => ({
      id: channel.id,
      name: channel.name,
      published: product.resourcePublicationsV2.nodes.some(
        (r) => r.isPublished && r.publication.id === channel.id,
      ),
    })),
    variants: product.variants.nodes.map((v): VariantView => ({
      id: v.id,
      title: v.title,
      optionValues: v.selectedOptions.map((o) => o.value),
      sku: v.sku ?? "",
      barcode: v.barcode ?? "",
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      costPerItem: v.inventoryItem.unitCost?.amount ?? null,
      taxable: v.taxable,
      inventoryPolicy: v.inventoryPolicy as InventoryPolicy,
      inventoryItemId: v.inventoryItem.id,
      trackInventory: v.inventoryItem.tracked,
      requiresShipping: v.inventoryItem.requiresShipping,
      weight: v.inventoryItem.measurement?.weight
        ? {
            value: v.inventoryItem.measurement.weight.value,
            unit: v.inventoryItem.measurement.weight.unit as WeightUnit,
          }
        : null,
      mediaId: v.media.nodes[0]?.id ?? null,
      levels: v.inventoryItem.inventoryLevels.nodes.map((level): InventoryLevelView => ({
        id: level.id,
        locationId: level.location.id,
        locationName: level.location.name,
        quantities: {
          available: qty(level.quantities, "available"),
          onHand: qty(level.quantities, "on_hand"),
          committed: qty(level.quantities, "committed"),
          incoming: qty(level.quantities, "incoming"),
          reserved: qty(level.quantities, "reserved"),
        },
      })),
    })),
    currency: shop.currencyCode,
    updatedAt: product.updatedAt,
  };
}

const collectionsResponse = z.object({
  collections: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        ruleSet: z.object({ appliedDisjunctively: z.boolean() }).nullable(),
      }),
    ),
  }),
});

export async function listCollections(): Promise<CollectionOption[]> {
  const data = await run(
    collectionsResponse,
    /* GraphQL */ `
      {
        collections(first: 250, sortKey: TITLE) {
          nodes {
            id
            title
            ruleSet {
              appliedDisjunctively
            }
          }
        }
      }
    `,
    {},
  );
  // Smart (rule-based) collections fill themselves; only manual ones can be joined by hand.
  return data.collections.nodes.map((c) => ({
    id: c.id,
    title: c.title,
    smart: c.ruleSet !== null,
  }));
}

const locationsResponse = z.object({
  locations: z.object({
    nodes: z.array(z.object({ id: z.string(), name: z.string(), isActive: z.boolean() })),
  }),
});

export async function listLocations(): Promise<LocationView[]> {
  const data = await run(
    locationsResponse,
    /* GraphQL */ `
      {
        locations(first: 50) {
          nodes {
            id
            name
            isActive
          }
        }
      }
    `,
    {},
  );
  return data.locations.nodes.map((l) => ({ id: l.id, name: l.name, active: l.isActive }));
}

// ---- Writing: products -------------------------------------------------------------------------------------------

const seo = (input: { seoTitle?: string | undefined; seoDescription?: string | undefined }) =>
  input.seoTitle !== undefined || input.seoDescription !== undefined
    ? { seo: { title: input.seoTitle ?? "", description: input.seoDescription ?? "" } }
    : {};

function productFields(input: ProductPatch) {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.descriptionHtml !== undefined ? { descriptionHtml: input.descriptionHtml } : {}),
    ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
    ...(input.productType !== undefined ? { productType: input.productType } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.handle ? { handle: input.handle } : {}),
    ...seo(input),
  };
}

const productPayload = z.object({
  product: z.object({ id: z.string(), handle: z.string() }).nullable(),
  userErrors: userErrorsSchema,
});

export async function createProduct(
  input: ProductInput,
  options: { name: string; values: string[] }[],
): Promise<{ id: string; handle: string }> {
  const data = await run(
    z.object({ productCreate: productPayload }),
    /* GraphQL */ `
      mutation CreateProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      product: {
        ...productFields(input),
        ...(input.collectionIds.length ? { collectionsToJoin: input.collectionIds } : {}),
        ...(options.length
          ? {
              productOptions: options.map((o) => ({
                name: o.name,
                values: o.values.map((name) => ({ name })),
              })),
            }
          : {}),
      },
    },
  );
  assertOk(data.productCreate.userErrors);
  if (!data.productCreate.product)
    throw new ShopifyUserError("Shopify did not create the product.");
  return data.productCreate.product;
}

export async function updateProduct(
  id: string,
  input: ProductPatch,
  collections?: { join: string[]; leave: string[] },
): Promise<void> {
  const data = await run(
    z.object({ productUpdate: productPayload }),
    /* GraphQL */ `
      mutation UpdateProduct($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      product: {
        id,
        ...productFields(input),
        ...(collections?.join.length ? { collectionsToJoin: collections.join } : {}),
        ...(collections?.leave.length ? { collectionsToLeave: collections.leave } : {}),
      },
    },
  );
  assertOk(data.productUpdate.userErrors);
}

/** Permanent. Archiving (status ARCHIVED, via `updateProduct`) is the reversible alternative. */
export async function deleteProduct(id: string): Promise<void> {
  const data = await run(
    z.object({
      productDelete: z.object({
        deletedProductId: z.string().nullable(),
        userErrors: userErrorsSchema,
      }),
    }),
    /* GraphQL */ `
      mutation DeleteProduct($input: ProductDeleteInput!) {
        productDelete(input: $input, synchronous: true) {
          deletedProductId
          userErrors {
            field
            message
          }
        }
      }
    `,
    { input: { id } },
  );
  assertOk(data.productDelete.userErrors);
}

// ---- Writing: variants and options -------------------------------------------------------------------------------

const variantPayload = z.object({
  productVariants: z.array(z.object({ id: z.string() })).nullable(),
  userErrors: userErrorsSchema,
});

function variantFields(variant: VariantInput, optionNames: string[]) {
  return {
    ...(variant.optionValues.length
      ? {
          optionValues: variant.optionValues.map((name, i) => ({
            optionName: optionNames[i] ?? "",
            name,
          })),
        }
      : {}),
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    barcode: variant.barcode,
    taxable: variant.taxable,
    inventoryPolicy: variant.inventoryPolicy,
    inventoryItem: {
      sku: variant.sku,
      tracked: variant.trackInventory,
      requiresShipping: variant.requiresShipping,
      ...(variant.costPerItem !== null ? { cost: variant.costPerItem } : {}),
      ...(variant.weight
        ? { measurement: { weight: { value: variant.weight.value, unit: variant.weight.unit } } }
        : {}),
    },
    ...(variant.mediaId ? { mediaId: variant.mediaId } : {}),
  };
}

export async function createVariants(
  productId: string,
  variants: VariantInput[],
  optionNames: string[],
): Promise<string[]> {
  if (variants.length === 0) return [];
  const data = await run(
    z.object({ productVariantsBulkCreate: variantPayload }),
    /* GraphQL */ `
      mutation CreateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { productId, variants: variants.map((v) => variantFields(v, optionNames)) },
  );
  assertOk(data.productVariantsBulkCreate.userErrors);
  return (data.productVariantsBulkCreate.productVariants ?? []).map((v) => v.id);
}

export async function updateVariants(
  productId: string,
  variants: (VariantInput & { id: string })[],
  optionNames: string[],
): Promise<void> {
  if (variants.length === 0) return;
  const data = await run(
    z.object({ productVariantsBulkUpdate: variantPayload }),
    /* GraphQL */ `
      mutation UpdateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { productId, variants: variants.map((v) => ({ id: v.id, ...variantFields(v, optionNames) })) },
  );
  assertOk(data.productVariantsBulkUpdate.userErrors);
}

export async function deleteVariants(productId: string, variantIds: string[]): Promise<void> {
  const data = await run(
    z.object({ productVariantsBulkDelete: z.object({ userErrors: userErrorsSchema }) }),
    /* GraphQL */ `
      mutation DeleteVariants($productId: ID!, $variantsIds: [ID!]!) {
        productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    { productId, variantsIds: variantIds },
  );
  assertOk(data.productVariantsBulkDelete.userErrors);
}

const optionPayload = z.object({ userErrors: userErrorsSchema });

export async function addOption(
  productId: string,
  option: { name: string; values: string[] },
): Promise<void> {
  const data = await run(
    z.object({ productOptionsCreate: optionPayload }),
    /* GraphQL */ `
      mutation AddOption($productId: ID!, $options: [OptionCreateInput!]!) {
        productOptionsCreate(productId: $productId, options: $options) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      productId,
      options: [{ name: option.name, values: option.values.map((name) => ({ name })) }],
    },
  );
  assertOk(data.productOptionsCreate.userErrors);
}

export async function updateOption(
  productId: string,
  option: { id: string; name?: string | undefined; addValues?: string[] | undefined },
): Promise<void> {
  const data = await run(
    z.object({ productOptionUpdate: optionPayload }),
    /* GraphQL */ `
      mutation UpdateOption(
        $productId: ID!
        $option: OptionUpdateInput!
        $add: [OptionValueCreateInput!]
      ) {
        productOptionUpdate(productId: $productId, option: $option, optionValuesToAdd: $add) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      productId,
      option: { id: option.id, ...(option.name ? { name: option.name } : {}) },
      add: option.addValues?.length ? option.addValues.map((name) => ({ name })) : null,
    },
  );
  assertOk(data.productOptionUpdate.userErrors);
}

export async function deleteOption(productId: string, optionId: string): Promise<void> {
  const data = await run(
    z.object({ productOptionsDelete: optionPayload }),
    /* GraphQL */ `
      mutation DeleteOption($productId: ID!, $options: [ID!]!) {
        productOptionsDelete(productId: $productId, options: $options) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    { productId, options: [optionId] },
  );
  assertOk(data.productOptionsDelete.userErrors);
}

// ---- Writing: images ---------------------------------------------------------------------------------------------

export async function addImages(
  productId: string,
  images: { url: string; alt: string }[],
): Promise<void> {
  const data = await run(
    z.object({ productUpdate: z.object({ userErrors: userErrorsSchema }) }),
    /* GraphQL */ `
      mutation AddImages($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
        productUpdate(product: $product, media: $media) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      product: { id: productId },
      media: images.map((image) => ({
        originalSource: image.url,
        alt: image.alt,
        mediaContentType: "IMAGE",
      })),
    },
  );
  assertOk(data.productUpdate.userErrors);
}

export async function deleteImages(productId: string, mediaIds: string[]): Promise<void> {
  const data = await run(
    z.object({ productDeleteMedia: z.object({ mediaUserErrors: userErrorsSchema }) }),
    /* GraphQL */ `
      mutation DeleteImages($productId: ID!, $mediaIds: [ID!]!) {
        productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
          mediaUserErrors {
            field
            message
          }
        }
      }
    `,
    { productId, mediaIds },
  );
  assertOk(data.productDeleteMedia.mediaUserErrors);
}

export async function reorderImages(productId: string, mediaIds: string[]): Promise<void> {
  const data = await run(
    z.object({ productReorderMedia: z.object({ mediaUserErrors: userErrorsSchema }) }),
    /* GraphQL */ `
      mutation ReorderImages($id: ID!, $moves: [MoveInput!]!) {
        productReorderMedia(id: $id, moves: $moves) {
          mediaUserErrors {
            field
            message
          }
        }
      }
    `,
    { id: productId, moves: mediaIds.map((id, index) => ({ id, newPosition: String(index) })) },
  );
  assertOk(data.productReorderMedia.mediaUserErrors);
}

// ---- Inventory ---------------------------------------------------------------------------------------------------

const stockResponse = z.object({
  productVariants: z.object({
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
    nodes: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        sku: z.string().nullable(),
        inventoryQuantity: z.number().nullable(),
        product: z.object({
          id: z.string(),
          title: z.string(),
          featuredMedia: z
            .object({
              preview: z.object({ image: z.object({ url: z.string() }).nullable() }).nullable(),
            })
            .nullable(),
        }),
        inventoryItem: z.object({ id: z.string(), tracked: z.boolean() }),
      }),
    ),
  }),
});

/** Variants whose total stock is at or below `maxQuantity` (use 0 for sold out). Untracked items have no stock to report. */
export async function listLowStock(options: {
  maxQuantity: number;
  after?: string | undefined;
  first?: number;
}): Promise<{ rows: StockRow[]; nextCursor: string | null }> {
  const max = Math.max(0, Math.floor(options.maxQuantity));
  const data = await run(
    stockResponse,
    /* GraphQL */ `
      query LowStock($first: Int!, $after: String, $query: String!) {
        productVariants(first: $first, after: $after, query: $query) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
            sku
            inventoryQuantity
            product {
              id
              title
              featuredMedia {
                preview {
                  image {
                    url
                  }
                }
              }
            }
            inventoryItem {
              id
              tracked
            }
          }
        }
      }
    `,
    {
      first: options.first ?? 50,
      after: options.after ?? null,
      query: `inventory_quantity:<=${max}`,
    },
  );
  const { nodes, pageInfo } = data.productVariants;
  return {
    rows: nodes
      .filter((n) => n.inventoryItem.tracked)
      .map((n): StockRow => ({
        variantId: n.id,
        productId: n.product.id,
        productTitle: n.product.title,
        variantTitle: n.title,
        sku: n.sku ?? "",
        inventoryItemId: n.inventoryItem.id,
        tracked: true,
        available: n.inventoryQuantity ?? 0,
        imageUrl: n.product.featuredMedia?.preview?.image?.url ?? null,
      })),
    nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
  };
}

export type AdjustmentResult = { groupId: string; quantityAfter: number | null };

export async function adjustAvailable(change: {
  inventoryItemId: string;
  locationId: string;
  delta: number;
  reason: string;
}): Promise<AdjustmentResult> {
  const data = await run(
    z.object({
      inventoryAdjustQuantities: z.object({
        inventoryAdjustmentGroup: z
          .object({
            id: z.string(),
            changes: z.array(
              z.object({ name: z.string(), quantityAfterChange: z.number().nullable().optional() }),
            ),
          })
          .nullable(),
        userErrors: userErrorsSchema,
      }),
    }),
    /* GraphQL */ `
      mutation Adjust($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          inventoryAdjustmentGroup {
            id
            changes {
              name
              quantityAfterChange
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      input: {
        reason: change.reason,
        name: "available",
        changes: [
          {
            delta: change.delta,
            inventoryItemId: change.inventoryItemId,
            locationId: change.locationId,
          },
        ],
      },
    },
  );
  assertOk(data.inventoryAdjustQuantities.userErrors);
  const group = data.inventoryAdjustQuantities.inventoryAdjustmentGroup;
  if (!group) throw new ShopifyUserError("Shopify did not record the adjustment.");
  const available = group.changes.find((c) => c.name === "available");
  return { groupId: group.id, quantityAfter: available?.quantityAfterChange ?? null };
}

/** Starts stocking an item at a location (it has no stock record there yet). */
export async function activateAtLocation(
  inventoryItemId: string,
  locationId: string,
  available: number,
): Promise<void> {
  const data = await run(
    z.object({ inventoryActivate: z.object({ userErrors: userErrorsSchema }) }),
    /* GraphQL */ `
      mutation Activate($inventoryItemId: ID!, $locationId: ID!, $available: Int) {
        inventoryActivate(
          inventoryItemId: $inventoryItemId
          locationId: $locationId
          available: $available
        ) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    { inventoryItemId, locationId, available },
  );
  assertOk(data.inventoryActivate.userErrors);
}

const itemContextResponse = z.object({
  inventoryItem: z
    .object({
      id: z.string(),
      tracked: z.boolean(),
      variant: z
        .object({
          id: z.string(),
          title: z.string(),
          sku: z.string().nullable(),
          product: z.object({ id: z.string(), title: z.string() }),
        })
        .nullable(),
    })
    .nullable(),
  location: z.object({ id: z.string(), name: z.string() }).nullable(),
});

/** What an inventory item is (product, variant, SKU) and where, for the adjustment ledger and for sanity checks. */
export async function getInventoryContext(inventoryItemId: string, locationId: string) {
  const data = await run(
    itemContextResponse,
    /* GraphQL */ `
      query ItemContext($item: ID!, $location: ID!) {
        inventoryItem(id: $item) {
          id
          tracked
          variant {
            id
            title
            sku
            product {
              id
              title
            }
          }
        }
        location(id: $location) {
          id
          name
        }
      }
    `,
    { item: inventoryItemId, location: locationId },
  );
  return data;
}

// ---- Sales channels (publishing) -------------------------------------------------------------------------------------

const publishPayload = z.object({ userErrors: userErrorsSchema });

/**
 * A product is only visible to customers once it is PUBLISHED on a sales channel, in addition to being Active.
 * (The headless storefront reads through its own channel, so a product missing from it never appears on the site.)
 */
export async function publishToChannels(productId: string, channelIds: string[]): Promise<void> {
  if (channelIds.length === 0) return;
  const data = await run(
    z.object({ publishablePublish: publishPayload }),
    /* GraphQL */ `
      mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    { id: productId, input: channelIds.map((publicationId) => ({ publicationId })) },
  );
  assertOk(data.publishablePublish.userErrors);
}

export async function unpublishFromChannels(
  productId: string,
  channelIds: string[],
): Promise<void> {
  if (channelIds.length === 0) return;
  const data = await run(
    z.object({ publishableUnpublish: publishPayload }),
    /* GraphQL */ `
      mutation UnpublishProduct($id: ID!, $input: [PublicationInput!]!) {
        publishableUnpublish(id: $id, input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    { id: productId, input: channelIds.map((publicationId) => ({ publicationId })) },
  );
  assertOk(data.publishableUnpublish.userErrors);
}

const channelStateResponse = channelsFragment.extend({
  product: z
    .object({
      resourcePublicationsV2: z.object({
        nodes: z.array(
          z.object({ isPublished: z.boolean(), publication: z.object({ id: z.string() }) }),
        ),
      }),
    })
    .nullable(),
});

/** Which channels exist and which of them the product is currently published on. */
export async function getChannelState(
  productId: string,
): Promise<{ all: string[]; published: string[] }> {
  const data = await run(
    channelStateResponse,
    /* GraphQL */ `
      query ChannelState($id: ID!) {
        publications(first: 50) {
          nodes {
            id
            name
          }
        }
        product(id: $id) {
          resourcePublicationsV2(first: 50) {
            nodes {
              isPublished
              publication {
                id
              }
            }
          }
        }
      }
    `,
    { id: productId },
  );
  return {
    all: data.publications.nodes.map((p) => p.id),
    published: (data.product?.resourcePublicationsV2.nodes ?? [])
      .filter((n) => n.isPublished)
      .map((n) => n.publication.id),
  };
}

/** Publishes on every channel the product is missing from (what the Shopify admin does for a new product). */
export async function ensurePublished(productId: string): Promise<void> {
  const { all, published } = await getChannelState(productId);
  await publishToChannels(
    productId,
    all.filter((id) => !published.includes(id)),
  );
}
