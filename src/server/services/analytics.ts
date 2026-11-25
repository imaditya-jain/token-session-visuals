import "server-only";

import type { AnalyticsResponse, SalesStats, Section } from "@/lib/analytics";
import { connectDb } from "@/server/db/connection";
import { Enquiry } from "@/server/db/models/enquiry";
import { logger } from "@/server/logger";
import { sealConfigured } from "@/server/seal/client";
import * as orders from "@/server/shopify/order-admin";

import { lowStock, viaShopify } from "./product-admin";
import { fetchSubscriptions } from "./subscriptions";

const unavailable = (reason: string): { status: "unavailable"; reason: string } => ({
  status: "unavailable",
  reason,
});

async function section<T>(work: () => Promise<T>, reason: string): Promise<Section<T>> {
  try {
    return { status: "ok", data: await work() };
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Analytics section unavailable",
    );
    return unavailable(reason);
  }
}

const cents = (amount: string): number => Math.round(Number(amount) * 100);
const fromCents = (n: number): string => (n / 100).toFixed(2);
const percent = (now: number, before: number): number | null =>
  before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null;

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

function summarise(list: orders.SalesOrder[]) {
  const counted = list.filter((o) => o.counted);
  let revenue = 0;
  let refunds = 0;
  let units = 0;
  const daily = new Map<string, { revenue: number; orders: number }>();
  const products = new Map<string, { units: number; revenue: number }>();
  const first = new Set<string>();
  const returning = new Set<string>();
  for (const o of counted) {
    const total = cents(o.total.amount);
    revenue += total;
    refunds += cents(o.refunded.amount);
    const day = o.createdAt.slice(0, 10);
    const d = daily.get(day) ?? { revenue: 0, orders: 0 };
    d.revenue += total;
    d.orders += 1;
    daily.set(day, d);
    for (const l of o.lines) {
      units += l.quantity;
      const p = products.get(l.title) ?? { units: 0, revenue: 0 };
      p.units += l.quantity;
      p.revenue += cents(l.amount.amount);
      products.set(l.title, p);
    }
    const key = o.customerId ?? `guest:${day}:${o.total.amount}`;
    (o.customerOrders > 1 ? returning : first).add(key);
  }
  return { counted, revenue, refunds, units, daily, products, first, returning };
}

async function sales(from: string, to: string): Promise<SalesStats> {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const previousTo = addDays(from, -1);
  const previousFrom = addDays(from, -days);
  const [current, previous] = await viaShopify(() =>
    Promise.all([orders.salesOrders(from, to), orders.salesOrders(previousFrom, previousTo)]),
  );
  const now = summarise(current.orders);
  const before = summarise(previous.orders);
  const comparable = !current.capped && !previous.capped;
  const currency = current.orders[0]?.total.currency ?? previous.orders[0]?.total.currency ?? "USD";
  const series: SalesStats["daily"] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const d = now.daily.get(date);
    series.push({ date, revenue: fromCents(d?.revenue ?? 0), orders: d?.orders ?? 0 });
  }
  return {
    currency,
    revenue: fromCents(now.revenue),
    orders: now.counted.length,
    averageOrder:
      now.counted.length > 0 ? fromCents(Math.round(now.revenue / now.counted.length)) : null,
    units: now.units,
    refunds: fromCents(now.refunds),
    firstTimeCustomers: now.first.size,
    returningCustomers: now.returning.size,
    uncounted: current.capped,
    daily: series,
    topProducts: [...now.products.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)
      .map(([title, p]) => ({ title, units: p.units, revenue: fromCents(p.revenue) })),
    change: {
      revenue: comparable ? percent(now.revenue, before.revenue) : null,
      orders: comparable ? percent(now.counted.length, before.counted.length) : null,
    },
  };
}

export async function buildAnalytics(
  from: string,
  to: string,
  allowed: {
    sales: boolean;
    orders: boolean;
    inventory: boolean;
    enquiries: boolean;
    subscriptions: boolean;
  },
): Promise<AnalyticsResponse> {
  const skipped = unavailable("Your role can't view this.");
  const [salesSection, unfulfilled, low, enquiries, subs] = await Promise.all([
    allowed.sales
      ? section(() => sales(from, to), "Shopify orders couldn't be read just now.")
      : skipped,
    allowed.orders
      ? section(
          () => viaShopify(() => orders.unfulfilledCount()),
          "Shopify orders couldn't be read just now.",
        )
      : skipped,
    allowed.inventory
      ? section(async () => {
          const page = await lowStock({ soldOutOnly: false });
          return { count: page.rows.length, more: page.nextCursor !== null };
        }, "Stock couldn't be read just now.")
      : skipped,
    allowed.enquiries
      ? section(async () => {
          await connectDb();
          const [contact, wholesale] = await Promise.all(
            (["contact", "wholesale"] as const).map((kind) =>
              Enquiry.countDocuments({ kind, status: "new", archivedAt: { $exists: false } }),
            ),
          );
          return { contact: contact ?? 0, wholesale: wholesale ?? 0 };
        }, "Enquiries couldn't be read just now.")
      : skipped,
    allowed.subscriptions
      ? sealConfigured()
        ? section(async () => {
            const [active, paused] = await Promise.all([
              fetchSubscriptions({ status: "ACTIVE" }),
              fetchSubscriptions({ status: "PAUSED" }),
            ]);
            return {
              active: active.items.length,
              paused: paused.items.length,
              more: active.nextCursor !== null || paused.nextCursor !== null,
            };
          }, "Seal Subscriptions couldn't be read just now.")
        : unavailable("Seal Subscriptions isn't connected yet.")
      : skipped,
  ]);
  return {
    range: { from, to },
    sales: salesSection,
    unfulfilled,
    lowStock: low,
    enquiries,
    subscriptions: subs,
  };
}
