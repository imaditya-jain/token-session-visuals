import { describe, expect, it } from "vitest";

import {
  earliestDeliveryDate,
  isBouquet,
  isDeliveryDateAllowed,
  isGift,
  latestDeliveryDate,
  occasionsFromTags,
} from "@/lib/gift";
import { bouquetDeliverySchema, giftAttributes, giftSchema } from "@/lib/gift-schemas";

// 2026-12-10 at 03:00 UTC is 08:30 in India; at 20:00 UTC it is already 01:30 on the 11th there.
const morning = new Date("2026-12-10T03:00:00Z");
const lateUtc = new Date("2026-12-10T20:00:00Z");

describe("delivery dates", () => {
  it("is tomorrow (India time) when there is no same-day cut-off", () => {
    expect(earliestDeliveryDate(morning, null)).toBe("2026-12-11");
    expect(earliestDeliveryDate(lateUtc, null)).toBe("2026-12-12");
  });

  it("allows today only before the cut-off hour", () => {
    expect(earliestDeliveryDate(morning, 12)).toBe("2026-12-10");
    expect(earliestDeliveryDate(morning, 8)).toBe("2026-12-11");
  });

  it("has a window from the earliest date to 30 days ahead", () => {
    expect(latestDeliveryDate(morning)).toBe("2027-01-09");
    expect(isDeliveryDateAllowed("2026-12-11", morning)).toBe(true);
    expect(isDeliveryDateAllowed("2026-12-10", morning)).toBe(false);
    expect(isDeliveryDateAllowed("2027-01-09", morning)).toBe(true);
    expect(isDeliveryDateAllowed("2027-01-10", morning)).toBe(false);
    expect(isDeliveryDateAllowed("tomorrow", morning)).toBe(false);
  });
});

describe("products", () => {
  it("recognises bouquets and gifts by type, and occasions by tag", () => {
    expect(isBouquet({ category: "Bouquets" })).toBe(true);
    expect(isBouquet({ category: "House Plants" })).toBe(false);
    expect(isGift({ category: "Gifts" })).toBe(true);
    expect(isGift({ category: "Bouquets" })).toBe(true);
    expect(
      occasionsFromTags(["Fresh", "occasion-birthday", "occasion-get-well", "occasion-nonsense"]),
    ).toEqual(["birthday", "get-well"]);
  });
});

describe("gift options", () => {
  const future = earliestDeliveryDate();
  const full = {
    kind: "bouquet" as const,
    recipient: "Asha Patil",
    address: "12 Civil Lines, Nagpur",
    phone: "+91 98765 43210",
    date: future,
    message: "Happy birthday!\nSee you soon.",
    from: "Ravi",
  };

  it("accepts a full bouquet delivery and turns it into order-line attributes in Nagpur", () => {
    const parsed = bouquetDeliverySchema.parse(full);
    expect(giftAttributes(parsed)).toEqual([
      { key: "Deliver to", value: "Asha Patil" },
      { key: "City", value: "Nagpur" },
      { key: "Address", value: "12 Civil Lines, Nagpur" },
      { key: "Delivery date", value: future },
      { key: "Phone", value: "+91 98765 43210" },
      { key: "Gift message", value: "Happy birthday!\nSee you soon." },
      { key: "From", value: "Ravi" },
    ]);
  });

  it("accepts a message-only gift and an empty one", () => {
    expect(giftAttributes(giftSchema.parse({ kind: "message", message: "Thank you" }))).toEqual([
      { key: "Gift message", value: "Thank you" },
    ]);
    expect(giftAttributes(giftSchema.parse({ kind: "message" }))).toEqual([]);
  });

  it("refuses a missing or past date, a bad phone, control characters and over-long messages", () => {
    for (const bad of [
      { ...full, date: "2020-01-01" },
      { ...full, date: "soon" },
      { ...full, phone: "abc" },
      { ...full, recipient: "A" },
      { ...full, address: "x" },
      { ...full, from: "Bad\u0007name" },
      { ...full, message: "x".repeat(301) },
      { ...full, message: "bell\u0007" },
    ]) {
      expect(bouquetDeliverySchema.safeParse(bad).success).toBe(false);
    }
  });

  it("does not let an incomplete bouquet slip through as a plain gift", () => {
    expect(giftSchema.safeParse({ ...full, date: "2020-01-01" }).success).toBe(false);
    expect(giftSchema.safeParse({ kind: "bouquet", message: "hi" }).success).toBe(false);
    expect(giftSchema.safeParse({ kind: "other" }).success).toBe(false);
  });
});
