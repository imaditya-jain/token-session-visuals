import "server-only";

import { z } from "zod";

/**
 * Shopify API version is pinned deliberately; upgrade by changing this constant and running the
 * contract tests.
 */
export const SHOPIFY_API_VERSION = "2025-10";

const hostFromUrl = (value: string) => value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");

const shopifySchema = z.object({
  SHOPIFY_STORE_URL: z
    .string()
    .min(1, "SHOPIFY_STORE_URL is required")
    .transform(hostFromUrl)
    .refine(
      (host) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host),
      "SHOPIFY_STORE_URL must be a store host",
    ),
  SHOPIFY_STOREFRONT_API_ACCESS_TOKEN: z
    .string()
    .min(10, "SHOPIFY_STOREFRONT_API_ACCESS_TOKEN is required"),
});

export type ShopifyEnv = z.infer<typeof shopifySchema>;

let cached: ShopifyEnv | undefined;

/** Validated lazily so importing this module never throws; first use fails fast with a clear message. */
export function shopifyEnv(): ShopifyEnv {
  if (cached) return cached;
  const parsed = shopifySchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid Shopify environment: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test hook: reset the memoized env. */
export function resetEnvCache() {
  cached = undefined;
}
