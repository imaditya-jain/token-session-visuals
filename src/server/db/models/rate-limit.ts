import "server-only";

import { Schema } from "mongoose";

import { defineModel } from "@/server/db/define-model";

type RateLimitDoc = { key: string; count: number; expireAt: Date };

const rateLimitSchema = new Schema<RateLimitDoc>({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true },
  // TTL index: Mongo deletes the counter once its window has elapsed.
  expireAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export const RateLimit = defineModel<RateLimitDoc>("RateLimit", rateLimitSchema);
