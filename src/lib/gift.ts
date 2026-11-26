/**
 * Gifting rules shared by the website, the API and the app. Plain data and pure functions (no zod), so client
 * code can use them without loading the validation library.
 */
import type { Product } from "@/lib/types";

/** Fresh flowers are delivered inside one city for now (owner decision). Add cities here as delivery grows. */
export const FRESH_DELIVERY = {
  city: "Nagpur",
  /**
   * Orders for today are accepted until this hour (0-23, India time). `null` = no same-day delivery: the earliest
   * date is tomorrow. Set it only once the delivery team has agreed a real cut-off; nothing here is a promise.
   */
  sameDayCutoffHour: null as number | null,
  /** How far ahead a date can be chosen. */
  maxDaysAhead: 30,
} as const;

/** Product type that marks a fresh bouquet in Shopify. */
export const BOUQUET_TYPE = "Bouquets";
/** Product type of the other gifts (plants, pots, hampers). */
export const GIFT_TYPE = "Gifts";

export const OCCASIONS = [
  { id: "birthday", label: "Birthday" },
  { id: "anniversary", label: "Anniversary" },
  { id: "thank-you", label: "Thank you" },
  { id: "get-well", label: "Get well" },
  { id: "housewarming", label: "Housewarming" },
  { id: "congratulations", label: "Congratulations" },
] as const;
export type OccasionId = (typeof OCCASIONS)[number]["id"];

/** Shopify tag that puts a product under an occasion, for example `occasion-birthday`. */
export const OCCASION_TAG_PREFIX = "occasion-";
export const occasionsFromTags = (tags: readonly string[]): string[] =>
  tags
    .filter((tag) => tag.startsWith(OCCASION_TAG_PREFIX))
    .map((tag) => tag.slice(OCCASION_TAG_PREFIX.length))
    .filter((id) => OCCASIONS.some((o) => o.id === id));

export const isBouquet = (product: Pick<Product, "category">): boolean =>
  product.category === BOUQUET_TYPE;
export const isGift = (product: Pick<Product, "category">): boolean =>
  product.category === GIFT_TYPE || isBouquet(product);

/** India Standard Time has no daylight saving, so a fixed offset is exact. */
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const istParts = (now: Date) => {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours(),
  };
};
const iso = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** The first date a fresh bouquet can be delivered, as YYYY-MM-DD in India time. */
export function earliestDeliveryDate(
  now: Date = new Date(),
  cutoff: number | null = FRESH_DELIVERY.sameDayCutoffHour,
): string {
  const { y, m, d, h } = istParts(now);
  const sameDay = cutoff !== null && h < cutoff;
  return iso(y, m, d + (sameDay ? 0 : 1));
}

/** The last date that can be chosen. */
export function latestDeliveryDate(now: Date = new Date()): string {
  const { y, m, d } = istParts(now);
  return iso(y, m, d + FRESH_DELIVERY.maxDaysAhead);
}

export function isDeliveryDateAllowed(date: string, now: Date = new Date()): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date >= earliestDeliveryDate(now) &&
    date <= latestDeliveryDate(now)
  );
}
