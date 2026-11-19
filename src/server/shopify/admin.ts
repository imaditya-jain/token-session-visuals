import "server-only";

import { z } from "zod";

import { adminEnv, SHOPIFY_API_VERSION } from "@/server/config/env";

import { ShopifyError } from "./client";

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

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Admin API request. Responses contain customer data, so they are NEVER stored in the shared data cache
 * (`cache: "no-store"`). Retries on throttling and 5xx with jittered backoff.
 */
export async function adminQuery(
  query: string,
  variables: Record<string, unknown>,
): Promise<unknown> {
  const { SHOPIFY_STORE_URL, SHOPIFY_ADMIN_API_ACCESS_TOKEN } = adminEnv();
  const url = `https://${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await wait(300 * 2 ** attempt + Math.random() * 100);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ADMIN_API_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new ShopifyError(`Shopify Admin responded ${response.status}`, response.status);
        continue;
      }
      if (!response.ok)
        throw new ShopifyError(`Shopify Admin responded ${response.status}`, response.status);

      const parsed = envelope.parse(await response.json());
      if (parsed.errors?.length) {
        const error = new ShopifyError(parsed.errors.map((e) => e.message).join("; "));
        if (parsed.errors.some((e) => e.extensions?.code === "THROTTLED")) {
          lastError = error;
          continue;
        }
        throw error;
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ShopifyError || error instanceof z.ZodError) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new ShopifyError("Shopify Admin request failed");
}
