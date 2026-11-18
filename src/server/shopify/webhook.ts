import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/** Verifies `X-Shopify-Hmac-Sha256` over the raw request body (timing-safe). */
export function verifyShopifyHmac(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let received: Buffer;
  try {
    received = Buffer.from(header, "base64");
  } catch {
    return false;
  }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const handlePayload = z.object({ handle: z.string().min(1) });

/**
 * Maps a webhook topic to the cache tags to revalidate. Unknown topics yield no tags (acknowledged, ignored).
 * Lists embed product data (price, stock, membership), so any catalog change also refreshes the `catalog` tag.
 */
export function tagsForWebhook(topic: string, payload: unknown): string[] {
  const parsed = handlePayload.safeParse(payload);
  const handle = parsed.success ? parsed.data.handle : undefined;
  switch (topic) {
    case "products/create":
    case "products/update":
    case "products/delete":
      return ["catalog", ...(handle ? [`product:${handle}`] : [])];
    case "collections/create":
    case "collections/update":
    case "collections/delete":
      return ["catalog", ...(handle ? [`collection:${handle}`] : [])];
    case "inventory_levels/update":
      return ["catalog"];
    default:
      return [];
  }
}
