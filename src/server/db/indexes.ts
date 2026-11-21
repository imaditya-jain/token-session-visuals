import "server-only";

import { AuthToken } from "@/server/db/models/auth-token";
import { EmailJob } from "@/server/db/models/email-job";
import { Notification } from "@/server/db/models/notification";
import { Job } from "@/server/db/models/job";
import { RateLimit } from "@/server/db/models/rate-limit";
import { ShopifyCollection, ShopifyOrder, ShopifyProduct } from "@/server/db/models/shopify-mirror";
import { Subscriber } from "@/server/db/models/subscriber";
import { User } from "@/server/db/models/user";

/**
 * Creates any missing indexes (idempotent, never drops). Uniqueness of accounts and TTL cleanup of rate
 * limit counters depend on these, so they are guaranteed on first connection instead of relying on a manual step.
 * Add every new model here.
 */
export async function ensureIndexes(): Promise<void> {
  await Promise.all([
    User.createIndexes(),
    RateLimit.createIndexes(),
    AuthToken.createIndexes(),
    EmailJob.createIndexes(),
    Job.createIndexes(),
    Notification.createIndexes(),
    Subscriber.createIndexes(),
    ShopifyProduct.createIndexes(),
    ShopifyCollection.createIndexes(),
    ShopifyOrder.createIndexes(),
  ]);
}
