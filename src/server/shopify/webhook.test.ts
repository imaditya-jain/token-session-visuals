import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { tagsForWebhook, verifyShopifyHmac } from "./webhook";

const secret = "test-secret";
const body = JSON.stringify({ handle: "monstera-deliciosa" });
const sign = (payload: string, key = secret) =>
  createHmac("sha256", key).update(payload).digest("base64");

describe("verifyShopifyHmac", () => {
  it("accepts a valid signature", () => {
    expect(verifyShopifyHmac(body, sign(body), secret)).toBe(true);
  });
  it("rejects a tampered body, wrong secret, missing or malformed header", () => {
    expect(verifyShopifyHmac(body + " ", sign(body), secret)).toBe(false);
    expect(verifyShopifyHmac(body, sign(body, "other"), secret)).toBe(false);
    expect(verifyShopifyHmac(body, null, secret)).toBe(false);
    expect(verifyShopifyHmac(body, "not-base64!!", secret)).toBe(false);
    expect(verifyShopifyHmac(body, "", secret)).toBe(false);
  });
});

describe("tagsForWebhook", () => {
  it("maps product and collection events to precise tags plus the catalog tag", () => {
    expect(tagsForWebhook("products/update", { handle: "zz-plant" })).toEqual([
      "catalog",
      "product:zz-plant",
    ]);
    expect(tagsForWebhook("collections/update", { handle: "seeds-tools" })).toEqual([
      "catalog",
      "collection:seeds-tools",
    ]);
  });
  it("falls back to the catalog tag when no handle is present and ignores unknown topics", () => {
    expect(tagsForWebhook("products/delete", { id: 1 })).toEqual(["catalog"]);
    expect(tagsForWebhook("inventory_levels/update", {})).toEqual(["catalog"]);
    expect(tagsForWebhook("orders/create", { handle: "x" })).toEqual([]);
  });
});
