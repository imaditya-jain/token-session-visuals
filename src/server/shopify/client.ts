import "server-only";

import { z } from "zod";

import { SHOPIFY_API_VERSION, shopifyEnv } from "@/server/config/env";

export class ShopifyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ShopifyError";
  }
}

const envelope = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        extensions: z.object({ code: z.string().optional() }).optional(),
      }),
    )
    .optional(),
});

type FetchOptions =
  | {
      /** Next.js cache tags used for on-demand revalidation from webhooks. */
      tags: string[];
      /** Fallback time-based revalidation (seconds) in case a webhook is missed. */
      revalidate?: number;
    }
  /** Per-visitor data (carts) must never enter the shared data cache. */
  | { noStore: true };

const TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Storefront API request: timeout, retry with jittered backoff on 429/5xx/THROTTLED, envelope validation. */
export async function storefrontQuery(
  query: string,
  variables: Record<string, unknown>,
  options: FetchOptions,
): Promise<unknown> {
  const { SHOPIFY_STORE_URL, SHOPIFY_STOREFRONT_API_ACCESS_TOKEN } = shopifyEnv();
  const url = `https://${SHOPIFY_STORE_URL}/api/${SHOPIFY_API_VERSION}/graphql.json`;

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await wait(250 * 2 ** attempt + Math.random() * 100);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_API_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...("noStore" in options
          ? { cache: "no-store" as const }
          : { next: { tags: options.tags, revalidate: options.revalidate ?? 3600 } }),
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new ShopifyError(`Shopify responded ${response.status}`, response.status);
        continue;
      }
      if (!response.ok)
        throw new ShopifyError(`Shopify responded ${response.status}`, response.status);

      const parsed = envelope.parse(await response.json());
      if (parsed.errors?.length) {
        const throttled = parsed.errors.some((e) => e.extensions?.code === "THROTTLED");
        const error = new ShopifyError(parsed.errors.map((e) => e.message).join("; "));
        if (throttled) {
          lastError = error;
          continue;
        }
        throw error;
      }
      return parsed.data;
    } catch (error) {
      // Only transport failures (network, timeout) are retried; API and validation errors are final.
      if (error instanceof ShopifyError || error instanceof z.ZodError) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new ShopifyError("Shopify request failed");
}
