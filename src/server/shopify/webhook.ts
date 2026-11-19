import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { gidFor, gidSchema, type MirrorResource } from "@/lib/shopify-gid";

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

export type MirrorAction = { action: "sync" | "delete"; resource: MirrorResource; gid: string };

const syncPayload = z.object({ admin_graphql_api_id: z.string() });
const deletePayload = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d{1,20}$/)]),
});

const TOPICS: Record<string, { resource: MirrorResource; action: "sync" | "delete" }> = {
  "products/create": { resource: "product", action: "sync" },
  "products/update": { resource: "product", action: "sync" },
  "products/delete": { resource: "product", action: "delete" },
  "collections/create": { resource: "collection", action: "sync" },
  "collections/update": { resource: "collection", action: "sync" },
  "collections/delete": { resource: "collection", action: "delete" },
  "orders/create": { resource: "order", action: "sync" },
  "orders/updated": { resource: "order", action: "sync" },
  "orders/paid": { resource: "order", action: "sync" },
  "orders/cancelled": { resource: "order", action: "sync" },
  "orders/fulfilled": { resource: "order", action: "sync" },
  "orders/partially_fulfilled": { resource: "order", action: "sync" },
  "orders/edited": { resource: "order", action: "sync" },
  "orders/delete": { resource: "order", action: "delete" },
};

/**
 * Which mirrored record a webhook is about, or null (unknown topic or a payload without a valid GID). Only the
 * GID is taken from the body: the record itself is re-read from Shopify, so a forged or reordered body can't
 * write data into our mirror.
 */
export function mirrorActionForWebhook(topic: string, payload: unknown): MirrorAction | null {
  const target = TOPICS[topic];
  if (!target) return null;
  const gid =
    target.action === "delete"
      ? (() => {
          const parsed = deletePayload.safeParse(payload);
          return parsed.success ? gidFor(target.resource, parsed.data.id) : null;
        })()
      : (() => {
          const parsed = syncPayload.safeParse(payload);
          return parsed.success ? parsed.data.admin_graphql_api_id : null;
        })();
  if (!gid || !gidSchema(target.resource).safeParse(gid).success) return null;
  return { action: target.action, resource: target.resource, gid };
}
