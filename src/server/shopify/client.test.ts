import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/server/config/env";

import { ShopifyError, storefrontQuery } from "./client";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("storefrontQuery", () => {
  beforeEach(() => {
    vi.stubEnv("SHOPIFY_STORE_URL", "https://example-store.myshopify.com/");
    vi.stubEnv("SHOPIFY_STOREFRONT_API_ACCESS_TOKEN", "shpat_test_token_value");
    resetEnvCache();
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as unknown as typeof setTimeout);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("posts to the pinned API version with the token and cache tags", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ data: { ok: true } }));
    const data = await storefrontQuery("{ shop { name } }", { a: 1 }, { tags: ["catalog"] });

    expect(data).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example-store.myshopify.com/api/2025-10/graphql.json");
    expect((init!.headers as Record<string, string>)["X-Shopify-Storefront-Access-Token"]).toBe(
      "shpat_test_token_value",
    );
    expect((init as { next?: { tags: string[] } }).next?.tags).toEqual(["catalog"]);
  });

  it("retries on 5xx and then succeeds", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({ data: { ok: 1 } }));
    await expect(storefrontQuery("q", {}, { tags: [] })).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on THROTTLED GraphQL errors", async () => {
    const throttled = json({
      errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(throttled)
      .mockResolvedValueOnce(json({ data: { ok: 2 } }));
    await expect(storefrontQuery("q", {}, { tags: [] })).resolves.toEqual({ ok: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry client errors", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({}, 401));
    await expect(storefrontQuery("q", {}, { tags: [] })).rejects.toBeInstanceOf(ShopifyError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry GraphQL validation errors", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(json({ errors: [{ message: "Field 'x' doesn't exist" }] }));
    await expect(storefrontQuery("q", {}, { tags: [] })).rejects.toThrow("Field 'x' doesn't exist");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the maximum attempts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({}, 500));
    await expect(storefrontQuery("q", {}, { tags: [] })).rejects.toThrow(/500/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails fast with a clear message when env is invalid", async () => {
    vi.stubEnv("SHOPIFY_STORE_URL", "");
    resetEnvCache();
    await expect(storefrontQuery("q", {}, { tags: [] })).rejects.toThrow(
      /Invalid Shopify environment/,
    );
  });
});
