import "server-only";

import { adminEnv } from "@/server/config/env";
import { logger } from "@/server/logger";

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
