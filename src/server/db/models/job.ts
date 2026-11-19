import "server-only";

import { Schema } from "mongoose";

import { defineModel } from "@/server/db/define-model";

export type JobStatus = "pending" | "processing" | "done" | "failed";

export type JobRecord = {
  /** Handler name, e.g. `shopify.customer.sync`. */
  type: string;
  /** Business key. While a job with the same type+key is still pending, enqueueing again is a no-op. */
  key?: string | undefined;
  /** Small, non-sensitive input (ids only); handlers load current data themselves. */
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  runAt: Date;
  lockedUntil?: Date | undefined;
  lastError?: string | undefined;
  createdAt: Date;
  /** TTL: finished jobs are purged after a retention period. */
  expireAt?: Date | undefined;
};

const jobSchema = new Schema<JobRecord>({
  type: { type: String, required: true },
  key: { type: String },
  payload: { type: Schema.Types.Mixed, required: true, default: {} },
  status: {
    type: String,
    enum: ["pending", "processing", "done", "failed"],
    required: true,
    default: "pending",
  },
  attempts: { type: Number, required: true, default: 0 },
  runAt: { type: Date, required: true, default: () => new Date() },
  lockedUntil: { type: Date },
  lastError: { type: String, maxlength: 500 },
  createdAt: { type: Date, required: true, default: () => new Date() },
  expireAt: { type: Date, index: { expireAfterSeconds: 0 } },
});

// A pending job already covers "the latest state" because handlers read current data when they run.
jobSchema.index(
  { type: 1, key: 1 },
  { unique: true, partialFilterExpression: { status: "pending", key: { $type: "string" } } },
);
jobSchema.index({ status: 1, runAt: 1 });

export const Job = defineModel<JobRecord>("Job", jobSchema);
