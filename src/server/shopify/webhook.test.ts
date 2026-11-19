import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { mirrorActionForWebhook, tagsForWebhook, verifyShopifyHmac } from "./webhook";

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

describe("mirrorActionForWebhook", () => {
  it("takes the GID from create/update payloads", () => {
    expect(
      mirrorActionForWebhook("products/update", {
        admin_graphql_api_id: "gid://shopify/Product/7",
      }),
    ).toEqual({ action: "sync", resource: "product", gid: "gid://shopify/Product/7" });
    expect(
      mirrorActionForWebhook("orders/paid", { admin_graphql_api_id: "gid://shopify/Order/9" }),
    ).toEqual({ action: "sync", resource: "order", gid: "gid://shopify/Order/9" });
    expect(
      mirrorActionForWebhook("collections/create", {
        admin_graphql_api_id: "gid://shopify/Collection/3",
      }),
    ).toEqual({ action: "sync", resource: "collection", gid: "gid://shopify/Collection/3" });
  });

  it("builds the GID from the numeric id on delete payloads", () => {
    expect(mirrorActionForWebhook("products/delete", { id: 7 })).toEqual({
      action: "delete",
      resource: "product",
      gid: "gid://shopify/Product/7",
    });
    expect(mirrorActionForWebhook("orders/delete", { id: "9" })).toEqual({
      action: "delete",
      resource: "order",
      gid: "gid://shopify/Order/9",
    });
  });

  it.each([
    ["unknown topic", "customers/create", { admin_graphql_api_id: "gid://shopify/Customer/1" }],
    [
      "GID of another resource type",
      "products/update",
      { admin_graphql_api_id: "gid://shopify/Order/9" },
    ],
    ["malformed GID", "products/update", { admin_graphql_api_id: "gid://shopify/Product/abc" }],
    [
      "injection in GID",
      "products/update",
      { admin_graphql_api_id: 'gid://shopify/Product/1") { id }' },
    ],
    ["missing GID", "products/update", { handle: "x" }],
    ["non-object payload", "products/update", "text"],
    ["negative delete id", "products/delete", { id: -1 }],
    ["non-numeric delete id", "products/delete", { id: "7; drop" }],
  ])("ignores %s", (_name, topic, payload) => {
    expect(mirrorActionForWebhook(topic, payload)).toBeNull();
  });
});
