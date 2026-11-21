import { z } from "zod";

import { configureZodForBrowser } from "@/lib/zod-browser";

configureZodForBrowser();

export const BUSINESS_TYPES = [
  "Café or restaurant",
  "Florist",
  "Garden centre or retailer",
  "Interior designer or office",
  "Hotel or events",
  "Other",
] as const;

/** Rejects control characters so applicant text can never smuggle extra email headers. */
const hasNoControlChars = (value: string) =>
  [...value].every((char) => char.charCodeAt(0) > 31 && char !== "\u007f");

const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(max, `Keep this under ${max} characters`)
    .refine(hasNoControlChars, "Remove special characters");

export const wholesaleSchema = z.object({
  businessName: singleLine(120),
  contactName: singleLine(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254)),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a phone number we can reach you on"),
  businessType: z.enum(BUSINESS_TYPES, { message: "Choose a business type" }),
  location: singleLine(120),
  /** Tax or business registration number; optional, the team asks for it when setting up an account. */
  taxId: z
    .string()
    .trim()
    .max(40, "Keep this under 40 characters")
    .refine(hasNoControlChars, "Remove special characters")
    .optional()
    .default(""),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more (at least 10 characters)")
    .max(3000, "Keep your message under 3,000 characters")
    .refine(
      (value) => [...value].every((c) => c === "\n" || c.charCodeAt(0) > 31),
      "Remove special characters",
    ),
  /** Honeypot: real visitors never see or fill this field. */
  website: z.string().max(200).optional().default(""),
});

export type WholesaleInput = z.input<typeof wholesaleSchema>;
