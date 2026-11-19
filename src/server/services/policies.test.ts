import { afterEach, describe, expect, it, vi } from "vitest";

const storefront = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/shopify/client", () => ({ storefrontQuery: storefront.query }));

import { getPolicy } from "./policies";

const shop = (overrides: Record<string, unknown> = {}) => ({
  shop: {
    privacyPolicy: { title: "Privacy policy", body: "<p>We respect your data.</p>" },
    termsOfService: null,
    shippingPolicy: { title: "Shipping policy", body: "   " },
    refundPolicy: { title: "Refund policy", body: "<script>alert(1)</script><p>30 days</p>" },
    ...overrides,
  },
});

afterEach(() => storefront.query.mockReset());

describe("getPolicy", () => {
  it("returns the sanitized policy", async () => {
    storefront.query.mockResolvedValue(shop());
    expect(await getPolicy("privacy-policy")).toEqual({
      title: "Privacy policy",
      html: "<p>We respect your data.</p>",
    });
    expect((await getPolicy("refund-policy"))?.html).toBe("<p>30 days</p>");
  });

  it("is null when the merchant has not written it (missing or blank)", async () => {
    storefront.query.mockResolvedValue(shop());
    expect(await getPolicy("terms-of-service")).toBeNull();
    expect(await getPolicy("shipping-policy")).toBeNull();
  });

  it("is null for unknown slugs without calling Shopify", async () => {
    expect(await getPolicy("../../etc/passwd")).toBeNull();
    expect(storefront.query).not.toHaveBeenCalled();
  });

  it("degrades to null when Shopify fails or answers with garbage", async () => {
    storefront.query.mockRejectedValue(new Error("down"));
    expect(await getPolicy("privacy-policy")).toBeNull();
    storefront.query.mockResolvedValue({ shop: { privacyPolicy: 5 } });
    expect(await getPolicy("privacy-policy")).toBeNull();
  });
});
