import type { NotificationKind } from "@/server/db/models/notification";

export type OrderState = {
  financialStatus: string;
  fulfillmentStatus: string;
  cancelledAt?: Date | undefined;
};

/** A just-placed order is announced if its processing time is within this window (webhook delivery is near-instant). */
export const PLACED_WINDOW_MS = 30 * 60 * 1000;

/**
 * What changed between the state we last held and the state Shopify now reports, as customer-facing events.
 *
 * Driven by transitions, never by "I have seen this order": the daily backfill re-reads every order, and a rule
 * like "new to us means new" would announce a customer's whole history the first time it runs. So:
 *  - `placed` needs a recently processed order we did not hold before;
 *  - `paid`, `shipped` and `cancelled` need a previous state to compare with.
 */
export function orderEvents(
  previous: OrderState | null,
  next: OrderState & { processedAt?: Date | undefined },
  now: Date = new Date(),
): NotificationKind[] {
  if (!previous) {
    const recent =
      next.processedAt !== undefined &&
      now.getTime() - next.processedAt.getTime() <= PLACED_WINDOW_MS;
    return recent ? ["order.placed"] : [];
  }

  const events: NotificationKind[] = [];
  if (previous.financialStatus !== "PAID" && next.financialStatus === "PAID")
    events.push("order.paid");
  const shippedBefore = isShipped(previous.fulfillmentStatus);
  if (!shippedBefore && isShipped(next.fulfillmentStatus)) events.push("order.shipped");
  if (!previous.cancelledAt && next.cancelledAt) events.push("order.cancelled");
  return events;
}

const isShipped = (status: string) => status === "FULFILLED" || status === "PARTIALLY_FULFILLED";
