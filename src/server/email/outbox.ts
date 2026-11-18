import "server-only";

import { after } from "next/server";
import type { Types } from "mongoose";

import { connectDb } from "@/server/db/connection";
import { EmailJob } from "@/server/db/models/email-job";
import { logger } from "@/server/logger";

import { sendEmail } from "./mailer";
import { type TemplateData, type TemplateName, templates } from "./templates";

const MAX_ATTEMPTS = 5;
/** Minutes to wait before attempt 2, 3, 4, 5. */
const BACKOFF_MINUTES = [1, 5, 30, 120];
const LOCK_MS = 2 * 60 * 1000;
const SENT_RETENTION_MS = 7 * 24 * 3600 * 1000;
const FAILED_RETENTION_MS = 14 * 24 * 3600 * 1000;

export type DeliveryOutcome = "sent" | "retry" | "failed" | "skipped";

/**
 * Transactional outbox: the job is written first (so nothing is lost if SMTP is down or the function is
 * recycled), delivery is attempted right after the response, and the cron sweeper retries stragglers.
 * Returns the job id, or null when `dedupeKey` was already enqueued.
 */
export async function enqueueEmail<T extends TemplateName>(
  template: T,
  to: string,
  data: TemplateData<T>,
  options: { dedupeKey?: string } = {},
): Promise<string | null> {
  templates[template].schema.parse(data);
  await connectDb();
  try {
    const job = await EmailJob.create({
      template,
      to,
      data,
      ...(options.dedupeKey ? { dedupeKey: options.dedupeKey } : {}),
    });
    scheduleDelivery(String(job._id));
    return String(job._id);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return null;
    throw error;
  }
}

function scheduleDelivery(jobId: string): void {
  try {
    after(() => processEmailJob(jobId).then(() => undefined));
  } catch {
    // No request scope (scripts, tests): the cron sweeper delivers it.
  }
}

/** Claims and sends one job. Safe to call concurrently: only one caller can claim it. */
export async function processEmailJob(jobId: string | Types.ObjectId): Promise<DeliveryOutcome> {
  await connectDb();
  const now = new Date();
  const job = await EmailJob.findOneAndUpdate(
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
    { new: true },
  ).lean();
  if (!job) return "skipped";

  try {
    await sendEmail(job.to, job.template as TemplateName, job.data);
    await EmailJob.updateOne(
      { _id: job._id },
      {
        $set: {
          status: "sent",
          sentAt: new Date(),
          expireAt: new Date(Date.now() + SENT_RETENTION_MS),
        },
        $unset: { data: 1, lockedUntil: 1, lastError: 1 },
      },
    );
    return "sent";
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    logger.error(
      { jobId: String(job._id), template: job.template, attempts: job.attempts, err: message },
      "Email delivery failed",
    );
    if (job.attempts >= MAX_ATTEMPTS) {
      await EmailJob.updateOne(
        { _id: job._id },
        {
          $set: {
            status: "failed",
            lastError: message,
            expireAt: new Date(Date.now() + FAILED_RETENTION_MS),
          },
          $unset: { data: 1, lockedUntil: 1 },
        },
      );
      return "failed";
    }
    const delayMinutes = BACKOFF_MINUTES[Math.min(job.attempts - 1, BACKOFF_MINUTES.length - 1)]!;
    await EmailJob.updateOne(
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

/** Cron entry point: delivers due jobs and recovers jobs whose worker died mid-send. */
export async function drainDueEmailJobs(limit = 25): Promise<{ attempted: number; sent: number }> {
  await connectDb();
  const now = new Date();
  const due = await EmailJob.find({
    $or: [
      { status: "pending", runAt: { $lte: now } },
      { status: "processing", lockedUntil: { $lt: now } },
    ],
  })
    .sort({ runAt: 1 })
    .limit(limit)
    .select("_id")
    .lean();

  let sent = 0;
  for (const job of due) if ((await processEmailJob(job._id)) === "sent") sent++;
  return { attempted: due.length, sent };
}
