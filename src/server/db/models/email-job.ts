import "server-only";

import { Schema } from "mongoose";

import { defineModel } from "@/server/db/define-model";

export type EmailJobStatus = "pending" | "processing" | "sent" | "failed";

export type EmailJobRecord = {
  /** Optional idempotency key: enqueueing the same key twice creates one job. */
  dedupeKey?: string | undefined;
  template: string;
  to: string;
  /** Template data. Removed once the job is sent or permanently failed (it may contain one-time links). */
  data?: Record<string, unknown> | undefined;
  status: EmailJobStatus;
  attempts: number;
  runAt: Date;
  lockedUntil?: Date | undefined;
  sentAt?: Date | undefined;
  lastError?: string | undefined;
  createdAt: Date;
  /** TTL: finished jobs are purged after a retention period. */
  expireAt?: Date | undefined;
};

const emailJobSchema = new Schema<EmailJobRecord>({
  dedupeKey: { type: String },
  template: { type: String, required: true },
  to: { type: String, required: true },
  data: { type: Schema.Types.Mixed },
  status: {
    type: String,
    enum: ["pending", "processing", "sent", "failed"],
    required: true,
    default: "pending",
  },
  attempts: { type: Number, required: true, default: 0 },
  runAt: { type: Date, required: true, default: () => new Date() },
  lockedUntil: { type: Date },
  sentAt: { type: Date },
  lastError: { type: String, maxlength: 500 },
  createdAt: { type: Date, required: true, default: () => new Date() },
  expireAt: { type: Date, index: { expireAfterSeconds: 0 } },
});

emailJobSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);
emailJobSchema.index({ status: 1, runAt: 1 });

export const EmailJob = defineModel<EmailJobRecord>("EmailJob", emailJobSchema);
