// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findById: vi.fn() }));
const shopify = vi.hoisted(() => ({ adminQuery: vi.fn(), findByEmail: vi.fn() }));
vi.mock("@/server/db/connection", () => ({ connectDb: vi.fn() }));
vi.mock("@/server/db/models/subscriber", () => ({
  Subscriber: { findById: () => ({ lean: () => db.findById() }) },
}));
vi.mock("@/server/shopify/admin", () => ({ adminQuery: shopify.adminQuery }));
vi.mock("@/server/services/customer-sync", () => ({ findByEmail: shopify.findByEmail }));

import { syncMarketingConsentToShopify } from "./customer-marketing";

const ok = {
  customerEmailMarketingConsentUpdate: {
    customer: { id: "gid://shopify/Customer/1" },
    userErrors: [],
  },
};
const confirmedAt = new Date("2026-11-21T10:00:00Z");

beforeEach(() => {
  vi.resetAllMocks();
  shopify.findByEmail.mockResolvedValue("gid://shopify/Customer/1");
  shopify.adminQuery.mockResolvedValue(ok);
});

const input = () => shopify.adminQuery.mock.calls[0]?.[1].input;

describe("syncMarketingConsentToShopify", () => {
  it("marks a confirmed (double opt-in) subscriber as subscribed", async () => {
    db.findById.mockResolvedValue({
      email: "a@example.com",
      status: "subscribed",
      source: "booking",
      confirmedAt,
    });
    await syncMarketingConsentToShopify("x");
    expect(input()).toEqual({
      customerId: "gid://shopify/Customer/1",
      emailMarketingConsent: {
        marketingState: "SUBSCRIBED",
        marketingOptInLevel: "CONFIRMED_OPT_IN",
        consentUpdatedAt: confirmedAt.toISOString(),
      },
    });
  });

  it("uses single opt-in for verified accounts", async () => {
    db.findById.mockResolvedValue({
      email: "a@example.com",
      status: "subscribed",
      source: "account",
      confirmedAt,
    });
    await syncMarketingConsentToShopify("x");
    expect(input().emailMarketingConsent.marketingOptInLevel).toBe("SINGLE_OPT_IN");
  });

  it("propagates an unsubscribe", async () => {
    db.findById.mockResolvedValue({
      email: "a@example.com",
      status: "unsubscribed",
      source: "footer",
      unsubscribedAt: confirmedAt,
    });
    await syncMarketingConsentToShopify("x");
    expect(input().emailMarketingConsent).toEqual({
      marketingState: "UNSUBSCRIBED",
      consentUpdatedAt: confirmedAt.toISOString(),
    });
  });

  it("leaves pending subscribers and unknown customers alone", async () => {
    db.findById.mockResolvedValue({ email: "a@example.com", status: "pending", source: "footer" });
    await syncMarketingConsentToShopify("x");
    db.findById.mockResolvedValue({
      email: "a@example.com",
      status: "subscribed",
      source: "footer",
      confirmedAt,
    });
    shopify.findByEmail.mockResolvedValue(null);
    await syncMarketingConsentToShopify("x");
    expect(shopify.adminQuery).not.toHaveBeenCalled();
  });

  it("raises Shopify's refusal so the job retries", async () => {
    db.findById.mockResolvedValue({
      email: "a@example.com",
      status: "subscribed",
      source: "footer",
      confirmedAt,
    });
    shopify.adminQuery.mockResolvedValue({
      customerEmailMarketingConsentUpdate: {
        customer: null,
        userErrors: [{ field: null, message: "nope" }],
      },
    });
    await expect(syncMarketingConsentToShopify("x")).rejects.toThrow("nope");
  });
});
