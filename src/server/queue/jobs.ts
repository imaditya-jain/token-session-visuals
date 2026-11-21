import "server-only";

import { after } from "next/server";
import type { Types } from "mongoose";

import { connectDb } from "@/server/db/connection";
import { Job } from "@/server/db/models/job";
import { logger } from "@/server/logger";
import { reportError } from "@/server/monitoring";

import { jobHandlers, type JobType } from "./handlers";

const MAX_ATTEMPTS = 5;
/** Minutes to wait before attempt 2, 3, 4, 5. */
const BACKOFF_MINUTES = [1, 5, 30, 120];
const LOCK_MS = 2 * 60 * 1000;
const DONE_RETENTION_MS = 3 * 24 * 3600 * 1000;
const FAILED_RETENTION_MS = 14 * 24 * 3600 * 1000;

export type JobOutcome = "done" | "retry" | "failed" | "skipped";

/**
 * Transactional job outbox for background work (Phase A of CLAUDE.md §9: Mongo now, BullMQ later behind this
 * interface). The job is written first, run right after the response, and retried by the cron sweeper.
 * Returns the job id, or null when an identical job (same type + key) is already waiting.
 */
export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>,
  options: { key?: string } = {},
): Promise<string | null> {
  jobHandlers[type].schema.parse(payload);
  await connectDb();
  try {
    const job = await Job.create({ type, payload, ...(options.key ? { key: options.key } : {}) });
    scheduleRun(String(job._id));
    return String(job._id);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return null;
    throw error;
  }
}

function scheduleRun(jobId: string): void {
  try {
    after(() => processJob(jobId).then(() => undefined));
  } catch {
    // No request scope (scripts, tests): the cron sweeper runs it.
  }
}

/** Claims and runs one job. Safe to call concurrently: only one caller can claim it. */
export async function processJob(jobId: string | Types.ObjectId): Promise<JobOutcome> {
  await connectDb();
  const now = new Date();
  const job = await Job.findOneAndUpdate(
    {
      _id: jobId,
      $or: [
        { status: "pending", runAt: { $lte: now } },
        { status: "processing", lockedUntil: { $lt: now } },
      ],
    },
    {
      $set: { status: "processing", lockedUntil: new Date(now.getTime() + LOCK_MS) },
      $inc: { attempts: 1 },
    },
    { returnDocument: "after" },
  ).lean();
  if (!job) return "skipped";

  try {
    const handler = jobHandlers[job.type as JobType];
    if (!handler) throw new Error(`Unknown job type: ${job.type}`);
    const followUps = await handler.run(handler.schema.parse(job.payload) as never);
    // Queued before this job is marked done: if queueing fails the whole job is retried (handlers are idempotent).
    for (const next of followUps ?? [])
      await enqueueJob(next.type, next.payload, next.key ? { key: next.key } : {});
    await Job.updateOne(
      { _id: job._id },
      {
        $set: { status: "done", expireAt: new Date(Date.now() + DONE_RETENTION_MS) },
        $unset: { lockedUntil: 1, lastError: 1 },
      },
    );
    return "done";
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    logger.error(
      { jobId: String(job._id), type: job.type, attempts: job.attempts, err: message },
      "Job failed",
    );
    if (job.attempts >= MAX_ATTEMPTS) {
      reportError(error, { jobType: job.type, jobId: String(job._id) });
      await Job.updateOne(
        { _id: job._id },
        {
          $set: {
            status: "failed",
            lastError: message,
            expireAt: new Date(Date.now() + FAILED_RETENTION_MS),
          },
          $unset: { lockedUntil: 1 },
        },
      );
      return "failed";
    }
    const delayMinutes = BACKOFF_MINUTES[Math.min(job.attempts - 1, BACKOFF_MINUTES.length - 1)]!;
    await Job.updateOne(
      { _id: job._id },
      {
        $set: {
          status: "pending",
          lastError: message,
          runAt: new Date(Date.now() + delayMinutes * 60_000),
        },
        $unset: { lockedUntil: 1 },
      },
    );
    return "retry";
  }
}

/** Cron entry point: runs due jobs and recovers jobs whose worker died mid-run. */
export async function drainDueJobs(limit = 25): Promise<{ attempted: number; done: number }> {
  await connectDb();
  const now = new Date();
  const due = await Job.find({
    $or: [
      { status: "pending", runAt: { $lte: now } },
      { status: "processing", lockedUntil: { $lt: now } },
    ],
  })
    .sort({ runAt: 1 })
    .limit(limit)
    .select("_id")
    .lean();

  let done = 0;
  for (const job of due) if ((await processJob(job._id)) === "done") done++;
  return { attempted: due.length, done };
}
