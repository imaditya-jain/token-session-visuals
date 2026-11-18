import { createHmac } from "node:crypto";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag }));

import { POST } from "./route";

const SECRET = "whsec_test_secret";
const sign = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body, "utf8").digest("base64");

const call = (body: string, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest("http://localhost:3000/api/webhooks/shopify", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    }),
  );
const signed = (payload: unknown, topic: string) => {
  const body = JSON.stringify(payload);
  return call(body, { "x-shopify-hmac-sha256": sign(body), "x-shopify-topic": topic });
};

describe("POST /api/webhooks/shopify", () => {
  beforeEach(() => {
    vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", SECRET);
    revalidateTag.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed (503) when no secret is configured", async () => {
    vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", "");
    const response = await signed({ handle: "x" }, "products/update");
    expect(response.status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects missing, wrong, tampered and wrong-secret signatures without revalidating anything", async () => {
    const body = JSON.stringify({ handle: "monstera-deliciosa" });
    const headers = { "x-shopify-topic": "products/update" };
    expect((await call(body, headers)).status).toBe(401);
    expect((await call(body, { ...headers, "x-shopify-hmac-sha256": "AAAA" })).status).toBe(401);
    expect(
      (await call(body, { ...headers, "x-shopify-hmac-sha256": sign(body, "other-secret") }))
        .status,
    ).toBe(401);
    expect(
      (await call(body + " ", { ...headers, "x-shopify-hmac-sha256": sign(body) })).status,
    ).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("revalidates the precise tags for product, collection and inventory events", async () => {
    expect((await signed({ handle: "zz-plant" }, "products/update")).status).toBe(200);
    expect(revalidateTag.mock.calls).toEqual([
      ["catalog", "max"],
      ["product:zz-plant", "max"],
    ]);

    revalidateTag.mockClear();
    await signed({ handle: "seeds-tools" }, "collections/update");
    expect(revalidateTag.mock.calls).toEqual([
      ["catalog", "max"],
      ["collection:seeds-tools", "max"],
    ]);

    revalidateTag.mockClear();
    await signed({ inventory_item_id: 1 }, "inventory_levels/update");
    expect(revalidateTag.mock.calls).toEqual([["catalog", "max"]]);
  });

  it("acknowledges unknown topics without revalidating, and tolerates payloads without a handle", async () => {
    expect((await signed({ id: 1 }, "orders/create")).status).toBe(200);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect((await signed({ id: 1 }, "products/delete")).status).toBe(200);
    expect(revalidateTag.mock.calls).toEqual([["catalog", "max"]]);
  });

  it("rejects invalid JSON (400) and oversized bodies (413) even when correctly signed", async () => {
    const bad = "{not json";
    expect(
      (
        await call(bad, {
          "x-shopify-hmac-sha256": sign(bad),
          "x-shopify-topic": "products/update",
        })
      ).status,
    ).toBe(400);

    const huge = JSON.stringify({ handle: "x", pad: "y".repeat(1_100_000) });
    expect(
      (
        await call(huge, {
          "x-shopify-hmac-sha256": sign(huge),
          "x-shopify-topic": "products/update",
        })
      ).status,
    ).toBe(413);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
