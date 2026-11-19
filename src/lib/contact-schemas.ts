import { z } from "zod";

export const CONTACT_TOPICS = [
  "Order or delivery",
  "Plant care advice",
  "Returns or guarantee",
  "Wholesale",
  "Careers",
  "Press and partnerships",
  "Something else",
] as const;

/** Rejects control characters so user text can never smuggle extra email headers. */
const hasNoControlChars = (value: string) =>
  [...value].every((char) => char.charCodeAt(0) > 31 && char !== "\u007f");

const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(max, `Keep this under ${max} characters`)
    .refine(hasNoControlChars, "Remove special characters");

export const contactSchema = z.object({
  name: singleLine(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254)),
  topic: z.enum(CONTACT_TOPICS),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more (at least 10 characters)")
    .max(3000, "Keep your message under 3,000 characters"),
  /** Honeypot: real visitors never see or fill this field. */
  website: z.string().max(200).optional().default(""),
});

export type ContactInput = z.input<typeof contactSchema>;
