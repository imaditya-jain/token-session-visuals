import "server-only";

import { connectDb } from "@/server/db/connection";
import { RateLimit } from "@/server/db/models/rate-limit";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

/** Swappable limiter: MongoDB today, Redis when traffic justifies it (see ARCHITECTURE.md). */
export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

class MongoRateLimiter implements RateLimiter {
  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    await connectDb();
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowSeconds * 1000);

    // Single atomic upsert: start a new window when none is active, otherwise increment.
    const run = () =>
      RateLimit.findOneAndUpdate(
        { key },
        [
          {
            $set: {
              active: { $gt: [{ $ifNull: ["$expireAt", new Date(0)] }, now] },
            },
          },
          {
            $set: {
              count: { $cond: ["$active", { $add: [{ $ifNull: ["$count", 0] }, 1] }, 1] },
              expireAt: { $cond: ["$active", "$expireAt", windowEnd] },
            },
          },
          { $unset: "active" },
        ],
        { upsert: true, new: true, updatePipeline: true },
      ).lean();

    let doc;
    try {
      doc = await run();
    } catch (error) {
      // Two first-ever requests can race on the unique index; the retry then takes the update path.
      if ((error as { code?: number }).code !== 11000) throw error;
      doc = await run();
    }
    if (!doc) throw new Error("Rate limiter failed to persist counter");

    const remaining = Math.max(0, limit - doc.count);
    return {
      allowed: doc.count <= limit,
      remaining,
      retryAfterSeconds: Math.max(1, Math.ceil((doc.expireAt.getTime() - now.getTime()) / 1000)),
    };
  }
}

export const rateLimiter: RateLimiter = new MongoRateLimiter();
