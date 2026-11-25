import "server-only";

import { z } from "zod";

import type {
  SubscriptionAction,
  SubscriptionDetail,
  SubscriptionListItem,
  SubscriptionListPage,
  SubscriptionListQuery,
} from "@/lib/subscriptions";
import { notFound } from "@/server/http/errors";
import { sealRequest } from "@/server/seal/client";

const str = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === null || v === undefined ? "" : String(v)));

const item = z.object({
  title: str,
  variant_sku: str,
  quantity: z.number().default(1),
  final_price: z.union([z.number(), z.string()]).nullish(),
  price: str,
  selling_plan_name: str,
});

const subscription = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  order_id: str,
  order_placed: str,
  status: str,
  email: str,
  first_name: str,
  last_name: str,
  currency: str,
  total_value: z.union([z.number(), z.string()]).nullish(),
  billing_interval: str,
  delivery_interval: str,
  cancelled_on: str,
  paused_on: str,
  s_first_name: str,
  s_last_name: str,
  s_address1: str,
  s_address2: str,
  s_city: str,
  s_province: str,
  s_zip: str,
  s_country: str,
  s_phone: str,
  items: z.array(item).default([]),
  billing_attempts: z
    .array(
      z.object({
        id: z.union([z.number(), z.string()]).transform(String),
        date: str,
        completed_at: str,
        status: str,
        order_id: str,
        error_message: str,
      }),
    )
    .default([]),
  log: z.array(z.object({ content: str, created: str })).default([]),
});
type Raw = z.infer<typeof subscription>;

const orNull = (v: string): string | null => (v === "" ? null : v);

/** The next charge is the earliest billing attempt that hasn't been completed yet (Seal has no single field for it). */
const nextBilling = (s: Raw): string | null => {
  const pending = s.billing_attempts
    .filter((b) => b.completed_at === "" && b.date !== "" && b.status.toLowerCase() !== "skipped")
    .map((b) => b.date)
    .sort();
  return pending[0] ?? null;
};

function toItem(s: Raw): SubscriptionListItem {
  return {
    id: s.id,
    status: s.status,
    customerName: [s.first_name, s.last_name].filter(Boolean).join(" ") || "Customer",
    email: s.email,
    plan: s.items.find((i) => i.selling_plan_name)?.selling_plan_name ?? "",
    items: s.items.map((i) => (i.quantity > 1 ? `${i.title} × ${i.quantity}` : i.title)).join(", "),
    interval: s.billing_interval,
    total:
      s.total_value === null || s.total_value === undefined ? "" : Number(s.total_value).toFixed(2),
    currency: s.currency,
    startedAt: orNull(s.order_placed),
    nextBilling: s.status === "ACTIVE" ? nextBilling(s) : null,
  };
}

export async function fetchSubscriptions(
  query: SubscriptionListQuery,
): Promise<SubscriptionListPage> {
  const params: Record<string, string> = { "with-billing-attempts": "true", "with-items": "true" };
  if (query.status === "ACTIVE") params["active-only"] = "true";
  if (query.status === "PAUSED") params["paused-only"] = "true";
  if (query.status === "CANCELLED") params["cancelled-only"] = "true";
  if (query.search) params["query"] = query.search;
  if (query.cursor) params["cursor"] = query.cursor;
  const payload = z
    .object({
      subscriptions: z.array(z.unknown()).default([]),
      next_cursor: z.string().nullable().optional(),
    })
    .parse(await sealRequest("GET", "subscriptions", { query: params }));
  return {
    items: payload.subscriptions.map((raw) => toItem(subscription.parse(raw))),
    nextCursor: payload.next_cursor ?? null,
  };
}

export async function readSubscription(id: string): Promise<SubscriptionDetail> {
  const payload = await sealRequest("GET", "subscription", { query: { id } });
  const parsed = subscription.safeParse(payload);
  if (!parsed.success) throw notFound("Subscription not found", "subscription_not_found");
  const s = parsed.data;
  return {
    ...toItem(s),
    cancelledOn: orNull(s.cancelled_on),
    pausedOn: orNull(s.paused_on),
    deliveryInterval: s.delivery_interval,
    orderId: s.order_id,
    shippingAddress: [
      [s.s_first_name, s.s_last_name].filter(Boolean).join(" "),
      s.s_address1,
      s.s_address2,
      [s.s_city, s.s_province, s.s_zip].filter(Boolean).join(", "),
      s.s_country,
      s.s_phone,
    ].filter(Boolean),
    lines: s.items.map((i) => ({
      title: i.title,
      sku: i.variant_sku,
      quantity: i.quantity,
      price:
        i.final_price === null || i.final_price === undefined
          ? i.price
          : Number(i.final_price).toFixed(2),
      plan: i.selling_plan_name,
    })),
    billing: s.billing_attempts.map((b) => ({
      id: b.id,
      date: b.date,
      completedAt: orNull(b.completed_at),
      status: b.status,
      orderId: b.order_id,
      error: b.error_message,
    })),
    log: s.log.slice(-30).reverse(),
  };
}

/** Pause, resume or cancel through Seal itself, so billing and Shopify's contract stay in step. */
export async function changeSubscription(
  id: string,
  action: SubscriptionAction,
): Promise<SubscriptionDetail> {
  const current = await readSubscription(id);
  if (action === "cancel" && current.status === "CANCELLED") return current;
  if (action === "pause" && current.status !== "ACTIVE") return current;
  if (action === "resume" && current.status !== "PAUSED") return current;
  await sealRequest("PUT", "subscription", { body: { id: Number(id), action } });
  return readSubscription(id);
}
