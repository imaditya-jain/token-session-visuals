import { z } from "zod";

import { configureZodForBrowser } from "@/lib/zod-browser";

configureZodForBrowser();

const objectId = z.string().regex(/^[a-f0-9]{24}$/, "Invalid id");
export const mediaObjectId = objectId;

const oneLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => ![...v].some((c) => c.charCodeAt(0) < 32), "Remove special characters");

export const mediaListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(1).max(60).default(24),
  search: oneLine(80).optional(),
  /** "all", "none" (not in a folder) or a folder id. */
  folder: z.union([z.literal("all"), z.literal("none"), objectId]).default("all"),
  /** "unused" lists only pictures nothing refers to. */
  usage: z.enum(["all", "unused"]).default("all"),
});
export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;

export const mediaPatchSchema = z
  .object({ alt: oneLine(300), folderId: objectId.nullable() })
  .partial()
  .refine((v) => v.alt !== undefined || v.folderId !== undefined, "Nothing to change");

export const folderInputSchema = z.object({
  name: oneLine(60).pipe(z.string().min(1, "Give the folder a name")),
});

export const mediaBulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete-unused"), ids: z.array(objectId).min(1).max(100) }),
  z.object({
    action: z.literal("move"),
    ids: z.array(objectId).min(1).max(100),
    folderId: objectId.nullable(),
  }),
]);

export type MediaUsage = {
  type: "post" | "page" | "site" | "campaign";
  label: string;
  href: string;
};

export type MediaItem = {
  id: string;
  url: string;
  alt: string;
  filename: string;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
  createdAt: string;
  folderId: string | null;
  replacedAt: string | null;
  usageCount: number;
};

export type MediaFolderView = { id: string; name: string; count: number };

export type MediaPage = { items: MediaItem[]; total: number };

export type MediaSummary = {
  total: number;
  bytes: number;
  unused: number;
  unfiled: number;
  folders: MediaFolderView[];
};
