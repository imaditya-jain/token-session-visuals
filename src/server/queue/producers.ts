import "server-only";

import { adminEnv } from "@/server/config/env";
import { logger } from "@/server/logger";

import type { MirrorResource } from "@/lib/shopify-gid";

import { enqueueJob } from "./jobs";

const adminConfigured = (): boolean => {
  try {
    adminEnv();
    return true;
  } catch {
    return false;
  }
};

/**
 * Queues a Shopify customer sync for an account. Never throws: a queue or Shopify problem must not break
 * registration or profile edits, and the daily sweeper plus the next profile edit catch up.
 * Does nothing when Shopify Admin isn't configured (local/e2e runs).
 */
export async function enqueueCustomerSync(userId: string): Promise<void> {
  if (!adminConfigured()) return;
  try {
    await enqueueJob("shopify.customer.sync", { userId }, { key: userId });
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error : String(error), userId },
      "Could not queue customer sync",
    );
  }
}

/**
 * Queues a re-read of one Shopify record (called from webhooks). Returns false when Shopify Admin isn't
 * configured. Throws if the queue itself is unavailable so the webhook can answer 503 and Shopify retries.
 */
export async function enqueueMirrorSync(
  action: "sync" | "delete",
  resource: MirrorResource,
  gid: string,
): Promise<boolean> {
  if (!adminConfigured()) return false;
  await enqueueJob(
    action === "sync" ? "shopify.mirror.sync" : "shopify.mirror.delete",
    { resource, gid },
    { key: `${action}:${gid}` },
  );
  return true;
}

/** Starts a full pass over products, collections and orders (the safety net behind webhooks). */
export async function enqueueMirrorBackfill(): Promise<void> {
  if (!adminConfigured()) return;
  for (const resource of ["product", "collection", "order"] as const) {
    try {
      await enqueueJob(
        "shopify.mirror.backfill",
        { resource },
        { key: `backfill:${resource}:first` },
      );
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error : String(error), resource },
        "Could not queue mirror backfill",
      );
    }
  }
}
