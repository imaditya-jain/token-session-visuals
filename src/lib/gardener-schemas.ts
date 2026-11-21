import { z } from "zod";

import { configureZodForBrowser } from "@/lib/zod-browser";

configureZodForBrowser();

/** Cities the gardener service covers for now (owner decision; extend here when the service area grows). */
export const GARDENER_CITIES = ["Nagpur", "Pune", "Mumbai"] as const;

/** Rejects control characters so booking text can never smuggle extra lines into order notes. */
const hasNoControlChars = (value: string) =>
  [...value].every((char) => char.charCodeAt(0) > 31 && char !== "\u007f");

const text = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} is too short`)
    .max(max, `${label} is too long`)
    .refine(hasNoControlChars, `${label} contains invalid characters`);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a visit date")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Choose a visit date")
  // One day of slack so a visitor ahead of UTC can still book "today".
  .refine(
    (value) => Date.parse(`${value}T00:00:00Z`) >= Date.now() - 86_400_000,
    "Choose a date that has not passed",
  );

/** What the customer tells us about the visit. Stored on the order line, so it reaches the owner with the order. */
export const bookingSchema = z.object({
  /** Full name; the first word is the first name, the rest the last name. */
  name: text("Name", 2, 80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254)),
  /** Optional marketing opt-in; consent is only recorded after the mailbox confirms it (double opt-in). */
  acceptsMarketing: z.boolean().optional().default(false),
  city: z.enum(GARDENER_CITIES, { message: "Choose a city" }),
  address: text("Address", 8, 300),
  date: isoDate,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a phone number we can reach you on"),
  notes: z
    .string()
    .trim()
    .max(500, "Notes are too long")
    .refine(hasNoControlChars, "Notes contain invalid characters")
    .optional(),
});

/** What the form submits (marketing choice defaults to off). */
export type BookingInput = z.input<typeof bookingSchema>;
export type Booking = z.output<typeof bookingSchema>;

/** The label/value pairs Shopify shows on the order line, in the order the owner reads them. */
export function bookingAttributes(booking: Booking): { key: string; value: string }[] {
  const rows: { key: string; value: string }[] = [
    { key: "Name", value: booking.name },
    { key: "City", value: booking.city },
    { key: "Address", value: booking.address },
    { key: "Preferred date", value: booking.date },
    { key: "Phone", value: booking.phone },
  ];
  if (booking.notes) rows.push({ key: "Notes", value: booking.notes });
  return rows;
}
