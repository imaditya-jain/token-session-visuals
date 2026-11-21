import { describe, expect, it } from "vitest";

import { orderEvents, PLACED_WINDOW_MS, type OrderState } from "./order-events";

const NOW = new Date("2026-06-01T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const state = (over: Partial<OrderState> = {}): OrderState => ({
  financialStatus: "PENDING",
  fulfillmentStatus: "UNFULFILLED",
  ...over,
});

describe("orderEvents: orders we did not hold before", () => {
  it("announces a just-placed order", () => {
    expect(orderEvents(null, { ...state(), processedAt: ago(60_000) }, NOW)).toEqual([
      "order.placed",
    ]);
  });

  it("does not announce history (this is what the daily backfill sees)", () => {
    expect(
      orderEvents(
        null,
        {
          ...state({ financialStatus: "PAID", fulfillmentStatus: "FULFILLED" }),
          processedAt: ago(3 * 86_400_000),
        },
        NOW,
      ),
    ).toEqual([]);
    expect(orderEvents(null, { ...state(), processedAt: ago(PLACED_WINDOW_MS + 1) }, NOW)).toEqual(
      [],
    );
  });

  it("announces only 'placed' for a new order that is already paid (no double message)", () => {
    expect(
      orderEvents(null, { ...state({ financialStatus: "PAID" }), processedAt: ago(1000) }, NOW),
    ).toEqual(["order.placed"]);
  });

  it("says nothing when the processing time is unknown", () => {
    expect(orderEvents(null, state(), NOW)).toEqual([]);
  });
});

describe("orderEvents: changes to an order we already hold", () => {
  it("announces payment, once", () => {
    expect(orderEvents(state(), state({ financialStatus: "PAID" }), NOW)).toEqual(["order.paid"]);
    expect(
      orderEvents(state({ financialStatus: "PAID" }), state({ financialStatus: "PAID" }), NOW),
    ).toEqual([]);
  });

  it.each(["FULFILLED", "PARTIALLY_FULFILLED"])("announces shipping (%s)", (fulfillmentStatus) => {
    expect(orderEvents(state(), state({ fulfillmentStatus }), NOW)).toEqual(["order.shipped"]);
  });

  it("does not announce shipping again when a partial shipment completes", () => {
    expect(
      orderEvents(
        state({ fulfillmentStatus: "PARTIALLY_FULFILLED" }),
        state({ fulfillmentStatus: "FULFILLED" }),
        NOW,
      ),
    ).toEqual([]);
  });

  it("announces cancellation, once", () => {
    const cancelled = state({ cancelledAt: ago(1000) });
    expect(orderEvents(state(), cancelled, NOW)).toEqual(["order.cancelled"]);
    expect(orderEvents(cancelled, cancelled, NOW)).toEqual([]);
  });

  it("reports several changes in one update", () => {
    expect(
      orderEvents(state(), state({ financialStatus: "PAID", fulfillmentStatus: "FULFILLED" }), NOW),
    ).toEqual(["order.paid", "order.shipped"]);
  });

  it("stays silent for unrelated updates", () => {
    expect(
      orderEvents(state({ financialStatus: "PAID" }), state({ financialStatus: "REFUNDED" }), NOW),
    ).toEqual([]);
  });
});
