import { z } from "zod";

import { blogTemplateSchema } from "@/lib/blog-templates";
import { richTextSchema } from "@/lib/rich-text/parse";
import { SLUG_PATTERN } from "@/lib/slug";
import { configureZodForBrowser } from "@/lib/zod-browser";

configureZodForBrowser();

const text = (max: number) => z.string().trim().max(max);
const slug = z
  .string()
  .trim()
  .max(80)
  .refine(
    (value) => value === "" || SLUG_PATTERN.test(value),
    "Use lowercase letters, digits and hyphens",
  )
  .transform((value) => (value === "" ? undefined : value));

export const POST_STATUSES = ["draft", "scheduled", "published", "trash"] as const;

export const featuredImageSchema = z.object({
  url: z.string().url().max(2048),
  alt: text(300),
  width: z.number().int().positive().max(10_000).optional(),
  height: z.number().int().positive().max(10_000).optional(),
});

export const postInputSchema = z.object({
  title: z.string().trim().min(1, "Give the post a title").max(200),
  slug: slug.optional(),
  excerpt: text(400).default(""),
  content: richTextSchema,
  featuredImage: featuredImageSchema.nullable().optional(),
  categoryIds: z.array(z.string().min(1).max(40)).max(20).default([]),
  tags: z.array(text(60)).max(20).default([]),
  template: blogTemplateSchema,
  seoTitle: text(120).default(""),
  seoDescription: text(320).default(""),
  status: z.enum(["draft", "published", "scheduled"]),
  scheduledAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

export type PostInputBody = z.infer<typeof postInputSchema>;

export const postListQuerySchema = z.object({
  status: z.enum(POST_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const bulkSchema = z.object({
  ids: z.array(z.string().min(1).max(40)).min(1).max(100),
  action: z.enum(["trash", "restore", "delete", "publish", "draft"]),
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Give the category a name").max(80),
  slug: slug.optional(),
  description: text(500).optional(),
  parentId: z.string().max(40).nullable().optional(),
});

export const categoryPatchSchema = categoryInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const tagPatchSchema = z
  .object({ name: z.string().trim().min(1).max(60), slug: slug })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const mediaAltSchema = z.object({ alt: text(300) });

export const mediaListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(1).max(60).default(24),
});
