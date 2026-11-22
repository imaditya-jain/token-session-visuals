import { z } from "zod";

import { configureZodForBrowser } from "@/lib/zod-browser";

configureZodForBrowser();

/** Shopify global ids, checked strictly so nothing but an id can reach a GraphQL variable. */
export const gid = (type: string) =>
  z.string().regex(new RegExp(`^gid://shopify/${type}/\\d{1,20}$`), `Invalid ${type} id`);
export const productGid = gid("Product");
export const variantGid = gid("ProductVariant");
export const collectionGid = gid("Collection");
export const locationGid = gid("Location");
export const inventoryItemGid = gid("InventoryItem");
export const mediaGid = gid("MediaImage");
export const publicationGid = gid("Publication");

/** Admin URLs carry only the numeric id; the type is fixed by the route. */
export const numericId = z.string().regex(/^\d{1,20}$/, "Invalid id");
export const toGid = (type: string, numeric: string): string => `gid://shopify/${type}/${numeric}`;
export const numericOf = (id: string): string => id.slice(id.lastIndexOf("/") + 1);

export const PRODUCT_STATUSES = ["ACTIVE", "DRAFT", "ARCHIVED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export const STATUS_NAMES: Record<ProductStatus, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
  ARCHIVED: "Archived",
};

export const WEIGHT_UNITS = ["GRAMS", "KILOGRAMS", "OUNCES", "POUNDS"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const INVENTORY_POLICIES = ["DENY", "CONTINUE"] as const;
export type InventoryPolicy = (typeof INVENTORY_POLICIES)[number];

/** Money stays a decimal string end to end (never a float): "12", "12.5" or "12.50". */
const money = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount like 12.50");
/** An optional amount: a decimal string, or empty / null for "none". */
const optionalMoney = z
  .union([money, z.literal(""), z.null()])
  .transform((value) => (value === "" ? null : value));

const text = (max: number) => z.string().trim().max(max);
const oneLine = (max: number) =>
  text(max).refine(
    (value) => ![...value].some((c) => c.charCodeAt(0) < 32),
    "Remove line breaks and special characters",
  );

export const productInputSchema = z.object({
  title: oneLine(255).pipe(z.string().min(1, "Give the product a title")),
  descriptionHtml: z.string().max(60_000).default(""),
  vendor: oneLine(255).default(""),
  productType: oneLine(255).default(""),
  tags: z
    .array(oneLine(255).pipe(z.string().min(1)))
    .max(250)
    .default([]),
  status: z.enum(PRODUCT_STATUSES).default("DRAFT"),
  handle: z
    .string()
    .trim()
    .max(255)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, digits and hyphens")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  seoTitle: oneLine(255).default(""),
  seoDescription: text(5000).default(""),
  collectionIds: z.array(collectionGid).max(250).default([]),
});
export type ProductInput = z.infer<typeof productInputSchema>;
/** A partial update: every field optional, and explicitly allowed to be absent. */
export type ProductPatch = { [K in keyof ProductInput]?: ProductInput[K] | undefined };

export const variantInputSchema = z.object({
  /** Absent for a new variant. */
  id: variantGid.optional(),
  /** One value per product option, in option order. */
  optionValues: z.array(oneLine(255).pipe(z.string().min(1))).max(3),
  sku: oneLine(255).default(""),
  barcode: oneLine(255).default(""),
  price: money,
  compareAtPrice: optionalMoney.default(""),
  costPerItem: optionalMoney.default(""),
  taxable: z.boolean().default(true),
  trackInventory: z.boolean().default(true),
  inventoryPolicy: z.enum(INVENTORY_POLICIES).default("DENY"),
  requiresShipping: z.boolean().default(true),
  weight: z
    .object({ value: z.number().min(0).max(1_000_000), unit: z.enum(WEIGHT_UNITS) })
    .nullable()
    .default(null),
  mediaId: mediaGid.nullable().default(null),
});
export type VariantInput = z.infer<typeof variantInputSchema>;

export const optionInputSchema = z.object({
  name: oneLine(255).pipe(z.string().min(1, "Name the option")),
  values: z
    .array(oneLine(255).pipe(z.string().min(1)))
    .min(1)
    .max(100),
});

/** Create: the product, its options and its variants in one request. */
export const createProductSchema = z
  .object({
    product: productInputSchema,
    options: z.array(optionInputSchema).max(3).default([]),
    variants: z.array(variantInputSchema).min(1).max(100),
  })
  .superRefine((value, ctx) => {
    value.variants.forEach((variant, index) => {
      if (variant.optionValues.length !== value.options.length) {
        ctx.addIssue({
          code: "custom",
          path: ["variants", index, "optionValues"],
          message: "Give each variant one value for every option.",
        });
      }
    });
    if (value.options.length === 0 && value.variants.length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Add an option (such as Size) to sell several variants.",
      });
    }
  });
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({ product: productInputSchema.partial() });

export const saveVariantsSchema = z.object({
  variants: z.array(variantInputSchema).min(1).max(100),
});

export const removeVariantsSchema = z.object({ variantIds: z.array(variantGid).min(1).max(100) });

export const addMediaSchema = z.object({
  images: z
    .array(
      z.object({
        url: z
          .string()
          .url()
          .max(2048)
          .refine((value) => {
            try {
              const url = new URL(value);
              return url.protocol === "https:" && url.hostname === "cdn.shopify.com";
            } catch {
              return false;
            }
          }, "Use an image from the media library"),
        alt: text(512).default(""),
      }),
    )
    .min(1)
    .max(20),
});

export const removeMediaSchema = z.object({ mediaIds: z.array(mediaGid).min(1).max(50) });
export const reorderMediaSchema = z.object({ mediaIds: z.array(mediaGid).min(1).max(250) });

export const addOptionSchema = z.object({ option: optionInputSchema });
export const updateOptionSchema = z.object({
  optionId: gid("ProductOption"),
  name: oneLine(255).pipe(z.string().min(1)).optional(),
  addValues: z
    .array(oneLine(255).pipe(z.string().min(1)))
    .max(100)
    .optional(),
});
export const deleteOptionSchema = z.object({ optionId: gid("ProductOption") });

/** The sales channels a product should be on. Anything not listed is withdrawn from. */
export const setChannelsSchema = z.object({ channelIds: z.array(publicationGid).max(50) });

export const productListQuerySchema = z.object({
  search: text(100).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  after: z.string().max(500).optional(),
});

export const adjustInventorySchema = z.object({
  inventoryItemId: inventoryItemGid,
  locationId: locationGid,
  /** Whole units, positive to add and negative to remove. */
  delta: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((n) => n !== 0, "Enter a change other than 0"),
  reason: z
    .enum([
      "correction",
      "received",
      "damaged",
      "cycle_count_available",
      "shrinkage",
      "movement_created",
    ])
    .default("correction"),
  note: text(300).default(""),
});

export const inventorySettingsSchema = z.object({
  lowStockThreshold: z.number().int().min(0).max(10_000),
});

// ---- Shapes the admin screens receive -------------------------------------------------------------------------

export type ProductListItem = {
  id: string;
  title: string;
  handle: string;
  status: ProductStatus;
  vendor: string;
  productType: string;
  tags: string[];
  imageUrl: string | null;
  totalInventory: number | null;
  tracksInventory: boolean;
  variantCount: number;
  priceMin: string | null;
  priceMax: string | null;
  currency: string | null;
  updatedAt: string;
};

export type ProductListPage = {
  items: ProductListItem[];
  nextCursor: string | null;
};

export type ProductMedia = {
  id: string;
  alt: string;
  url: string;
  width: number | null;
  height: number | null;
};
export type ProductOption = { id: string; name: string; position: number; values: string[] };
export type InventoryQuantities = {
  available: number;
  onHand: number;
  committed: number;
  incoming: number;
  reserved: number;
};
export type InventoryLevelView = {
  id: string;
  locationId: string;
  locationName: string;
  quantities: InventoryQuantities;
};

export type VariantView = {
  id: string;
  title: string;
  optionValues: string[];
  sku: string;
  barcode: string;
  price: string;
  compareAtPrice: string | null;
  costPerItem: string | null;
  taxable: boolean;
  inventoryPolicy: InventoryPolicy;
  inventoryItemId: string;
  trackInventory: boolean;
  requiresShipping: boolean;
  weight: { value: number; unit: WeightUnit } | null;
  mediaId: string | null;
  levels: InventoryLevelView[];
};

export type ProductDetail = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  status: ProductStatus;
  vendor: string;
  productType: string;
  tags: string[];
  seoTitle: string;
  seoDescription: string;
  options: ProductOption[];
  media: ProductMedia[];
  collections: { id: string; title: string }[];
  /** Every sales channel of the shop and whether this product is published on it. */
  channels: { id: string; name: string; published: boolean }[];
  variants: VariantView[];
  currency: string;
  updatedAt: string;
};

export type CollectionOption = { id: string; title: string; smart: boolean };
export type LocationView = { id: string; name: string; active: boolean };

export type StockRow = {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  inventoryItemId: string;
  tracked: boolean;
  available: number;
  imageUrl: string | null;
};
