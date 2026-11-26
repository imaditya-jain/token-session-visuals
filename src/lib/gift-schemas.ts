import { z } from "zod";

import { FRESH_DELIVERY, isDeliveryDateAllowed } from "@/lib/gift";
import { configureZodForBrowser } from "@/lib/zod-browser";

configureZodForBrowser();

/** Rejects control characters so gift text can never smuggle extra lines into order notes. */
const hasNoControlChars = (value: string) =>
  [...value].every((char) => char === "\n" || (char.charCodeAt(0) > 31 && char !== "\u007f"));
const singleLine = (value: string) =>
  [...value].every((char) => char.charCodeAt(0) > 31 && char !== "\u007f");

const line = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} is too short`)
    .max(max, `${label} is too long`)
    .refine(singleLine, `${label} contains invalid characters`);

/** Gift options: always a message; fresh bouquets also need where and when. */
export const giftMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .max(300, "Keep the message under 300 characters")
    .refine(hasNoControlChars, "The message contains invalid characters")
    .optional(),
  from: line("Your name", 1, 80).optional(),
});

export const bouquetDeliverySchema = giftMessageSchema.extend({
  kind: z.literal("bouquet"),
  recipient: line("Recipient name", 2, 80),
  address: line("Delivery address", 8, 300),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a phone number the delivery person can call"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a delivery date")
    .refine((value) => isDeliveryDateAllowed(value), "Choose a date from the list"),
});

const plainGiftSchema = giftMessageSchema.extend({ kind: z.literal("message") });

/** What the cart API accepts. `kind` says which one it is, so an incomplete bouquet is an error, never a plain gift. */
export const giftSchema = z.discriminatedUnion("kind", [bouquetDeliverySchema, plainGiftSchema]);
export type BouquetDelivery = z.output<typeof bouquetDeliverySchema>;
export type GiftOptions = z.output<typeof giftSchema>;

/** The label/value pairs Shopify shows on the order line, in the order the florist reads them. */
export function giftAttributes(gift: GiftOptions): { key: string; value: string }[] {
  const rows: { key: string; value: string }[] = [];
  if (gift.kind === "bouquet") {
    rows.push(
      { key: "Deliver to", value: gift.recipient },
      { key: "City", value: FRESH_DELIVERY.city },
      { key: "Address", value: gift.address },
      { key: "Delivery date", value: gift.date },
      { key: "Phone", value: gift.phone },
    );
  }
  if (gift.message) rows.push({ key: "Gift message", value: gift.message });
  if (gift.from) rows.push({ key: "From", value: gift.from });
  return rows;
}
