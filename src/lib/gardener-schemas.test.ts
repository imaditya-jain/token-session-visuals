import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bookingAttributes, bookingSchema } from "./gardener-schemas";

const valid = {
  name: "Ada Lovelace",
  email: "Ada@Example.com",
  city: "Mumbai",
  address: "12 Garden Road, Bandra",
  date: "2026-12-01",
  phone: "+91 98765 43210",
};

beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-11-21T10:00:00Z")));
afterEach(() => vi.useRealTimers());

describe("bookingSchema", () => {
  it("accepts a complete booking and keeps optional notes out when empty", () => {
    const parsed = bookingSchema.parse(valid);
    expect(parsed.email).toBe("ada@example.com");
    expect(parsed.acceptsMarketing).toBe(false);
    expect(bookingAttributes(parsed).map((row) => row.key)).toEqual([
      "Name",
      "City",
      "Address",
      "Preferred date",
      "Phone",
    ]);
    expect(
      bookingAttributes(bookingSchema.parse({ ...valid, notes: "Ring twice" })).at(-1),
    ).toEqual({
      key: "Notes",
      value: "Ring twice",
    });
  });

  it.each([
    ["city outside the service area", { city: "Delhi" }],
    ["short address", { address: "x" }],
    ["past date", { date: "2026-11-01" }],
    ["impossible date", { date: "2026-13-45" }],
    ["bad phone", { phone: "call me" }],
    ["missing name", { name: "A" }],
    ["bad email", { email: "nope" }],
    ["control characters", { address: "12 Garden Road\r\nBcc: x@y.z" }],
    ["very long notes", { notes: "n".repeat(501) }],
  ])("rejects %s", (_label, patch) => {
    expect(bookingSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("lets a visitor ahead of UTC book today", () => {
    expect(bookingSchema.safeParse({ ...valid, date: "2026-11-21" }).success).toBe(true);
  });
});
