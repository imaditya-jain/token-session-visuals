import { z } from "zod";

export const analyticsQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((v) => v.from <= v.to, "The start date must not be after the end date")
  .refine(
    (v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 <= 366,
    "Choose a range of one year or less",
  );

/** A figure that is either known or honestly unavailable. Unavailable is never shown as zero. */
export type Section<T> = { status: "ok"; data: T } | { status: "unavailable"; reason: string };

export type SalesStats = {
  currency: string;
  revenue: string;
  orders: number;
  averageOrder: string | null;
  units: number;
  refunds: string;
  firstTimeCustomers: number;
  returningCustomers: number;
  /** Orders not fetched because the range holds more than the cap. 0 = everything was counted. */
  uncounted: boolean;
  daily: { date: string; revenue: string; orders: number }[];
  topProducts: { title: string; units: number; revenue: string }[];
  /** Percent change against the previous period of the same length; null when it can't be compared. */
  change: { revenue: number | null; orders: number | null };
};

export type AnalyticsResponse = {
  range: { from: string; to: string };
  sales: Section<SalesStats>;
  unfulfilled: Section<number>;
  lowStock: Section<{ count: number; more: boolean }>;
  enquiries: Section<{ contact: number; wholesale: number }>;
  subscriptions: Section<{ active: number; paused: number; more: boolean }>;
};
