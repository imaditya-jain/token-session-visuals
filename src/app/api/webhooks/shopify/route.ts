import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { logger } from "@/server/logger";
import { enqueueMirrorSync } from "@/server/queue/producers";
import {
  mirrorActionForWebhook,
  tagsForWebhook,
  verifyShopifyHmac,
} from "@/server/shopify/webhook";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;

/**
 * Shopify → storefront cache invalidation. Not a public API: every request must carry a valid
 * HMAC signature. Fails closed when the secret is not configured.
 */
export async function POST(request: Request) {
  const secret = process.env["SHOPIFY_WEBHOOK_SECRET"];
  if (!secret) return NextResponse.json({ error: { code: "not_configured" } }, { status: 503 });

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: { code: "payload_too_large" } }, { status: 413 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: { code: "payload_too_large" } }, { status: 413 });
  }
  if (!verifyShopifyHmac(rawBody, request.headers.get("x-shopify-hmac-sha256"), secret)) {
    return NextResponse.json({ error: { code: "unauthorized" } }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: { code: "invalid_json" } }, { status: 400 });
  }

  const topic = request.headers.get("x-shopify-topic") ?? "";
  for (const tag of tagsForWebhook(topic, payload)) revalidateTag(tag, "max");

  // Mirror the record's GID into our database. Queued (not done inline) so Shopify gets its 200 quickly; the
  // job re-reads the record, so redelivered or out-of-order webhooks are harmless and need no dedupe store.
  const mirror = mirrorActionForWebhook(topic, payload);
  if (mirror) {
    try {
      await enqueueMirrorSync(mirror.action, mirror.resource, mirror.gid);
    } catch (error) {
      // Our queue is down: ask Shopify to redeliver instead of silently losing the change.
      logger.error(
        { err: error instanceof Error ? error : String(error), topic },
        "Webhook not queued",
      );
      return NextResponse.json(
        { error: { code: "service_unavailable" } },
        { status: 503, headers: { "Retry-After": "30" } },
      );
    }
  }
  return NextResponse.json({ data: { received: true } });
}
