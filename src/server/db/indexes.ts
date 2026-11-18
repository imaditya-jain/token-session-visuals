import "server-only";

import { AuthToken } from "@/server/db/models/auth-token";
import { EmailJob } from "@/server/db/models/email-job";
import { RateLimit } from "@/server/db/models/rate-limit";
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
    Subscriber.createIndexes(),
  ]);
}
