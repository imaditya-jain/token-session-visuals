import { z } from "zod";

import { ENQUIRY_KINDS } from "@/lib/enquiries";
import { configureZodForBrowser } from "@/lib/zod-browser";

configureZodForBrowser();

const flag = z
  .enum(["1", "true", "0", "false"])
  .optional()
  .transform((value) => value === "1" || value === "true");

export const enquiryQuerySchema = z.object({
  kind: z.enum(ENQUIRY_KINDS),
  status: z.string().max(20).optional(),
  search: z.string().trim().max(100).optional(),
  assignee: z.string().max(40).optional(),
  archived: flag,
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const enquiryExportQuerySchema = z.object({
  kind: z.enum(ENQUIRY_KINDS),
  status: z.string().max(20).optional(),
  search: z.string().trim().max(100).optional(),
  assignee: z.string().max(40).optional(),
  archived: flag,
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export const enquiryPatchSchema = z
  .object({
    status: z.string().max(20),
    assignedTo: z.string().max(40).nullable(),
    archived: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const enquiryNoteSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Write a note first")
    .max(2000, "Keep notes under 2,000 characters"),
});
