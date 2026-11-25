import "server-only";

import { Types } from "mongoose";

import {
  campaignContentSchema,
  type CampaignContent,
  type CampaignDetail,
  type CampaignInput,
  type CampaignListItem,
  type CampaignStats,
  type CampaignStatus,
} from "@/lib/campaigns";
import { optimizedImageUrl } from "@/lib/rich-text/render";
import { createUnsubscribeToken } from "@/server/auth/tokens";
import { siteUrl } from "@/server/config/env";
import { connectDb } from "@/server/db/connection";
import { Campaign, type CampaignRecord } from "@/server/db/models/campaign";
import { EmailJob } from "@/server/db/models/email-job";
import { Subscriber } from "@/server/db/models/subscriber";
import { enqueueEmail } from "@/server/email/outbox";
import { renderEmail } from "@/server/email/mailer";
import { AppError, badRequest, conflict, notFound } from "@/server/http/errors";
import { logger } from "@/server/logger";

import { enqueueCampaign } from "./newsletter";

const MIN_LEAD_MINUTES = 3;

const oid = (id: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(id)) throw notFound("Campaign not found", "campaign_not_found");
  return new Types.ObjectId(id);
};

async function statsOf(record: CampaignRecord): Promise<CampaignStats | null> {
  if (record.status === "draft" || record.status === "scheduled") return null;
  const prefix = `^campaign:${String(record._id)}:`;
  const rows = await EmailJob.aggregate<{ _id: string; n: number }>([
    { $match: { dedupeKey: { $regex: prefix } } },
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);
  const count = (status: string) => rows.find((r) => r._id === status)?.n ?? 0;
  return {
    queued: record.queued ?? 0,
    skipped: record.skipped ?? 0,
    delivered: count("sent"),
    failed: count("failed"),
    pending: count("pending") + count("processing"),
  };
}

async function toListItem(record: CampaignRecord): Promise<CampaignListItem> {
  return {
    id: String(record._id),
    name: record.name,
    subject: record.subject,
    design: record.design,
    status: record.status,
    scheduledAt: record.scheduledAt?.toISOString() ?? null,
    sentAt: record.sentAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
    stats: await statsOf(record),
  };
}

async function toDetail(record: CampaignRecord): Promise<CampaignDetail> {
  const content = campaignContentSchema.parse(record.content);
  return { ...(await toListItem(record)), preheader: record.preheader, content };
}

export async function listCampaigns(status?: CampaignStatus): Promise<CampaignListItem[]> {
  await connectDb();
  const rows = await Campaign.find(status ? { status } : {})
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
  return Promise.all(rows.map(toListItem));
}

export async function getCampaign(id: string): Promise<CampaignDetail> {
  await connectDb();
  const record = await Campaign.findById(oid(id)).lean();
  if (!record) throw notFound("Campaign not found", "campaign_not_found");
  return toDetail(record);
}

export const audienceSize = async (): Promise<number> => {
  await connectDb();
  return Subscriber.countDocuments({ status: "subscribed" });
};

export async function createCampaign(
  actorId: string,
  input: CampaignInput,
): Promise<CampaignDetail> {
  await connectDb();
  const by = new Types.ObjectId(actorId);
  const record = await Campaign.create({ ...input, status: "draft", createdBy: by, updatedBy: by });
  return getCampaign(String(record._id));
}

export async function updateCampaign(
  actorId: string,
  id: string,
  input: CampaignInput,
): Promise<CampaignDetail> {
  await connectDb();
  // Only drafts and scheduled campaigns can change; one being sent or already sent is a record.
  const updated = await Campaign.findOneAndUpdate(
    { _id: oid(id), status: { $in: ["draft", "scheduled"] } },
    { $set: { ...input, updatedBy: new Types.ObjectId(actorId) } },
    { new: true },
  ).lean();
  if (!updated) {
    const exists = await Campaign.exists({ _id: oid(id) });
    if (!exists) throw notFound("Campaign not found", "campaign_not_found");
    throw conflict(
      "This campaign has already been sent, so it can't be changed.",
      "campaign_locked",
    );
  }
  return toDetail(updated);
}

export async function deleteCampaign(id: string): Promise<void> {
  await connectDb();
  const removed = await Campaign.findOneAndDelete({
    _id: oid(id),
    status: { $in: ["draft", "scheduled"] },
  });
  if (!removed) {
    const exists = await Campaign.exists({ _id: oid(id) });
    if (!exists) throw notFound("Campaign not found", "campaign_not_found");
    throw conflict(
      "A campaign that was sent is kept as a record and can't be deleted.",
      "campaign_locked",
    );
  }
}

function emailData(input: {
  subject: string;
  preheader: string;
  design: string;
  content: CampaignContent;
}) {
  const c = input.content;
  return {
    subject: input.subject,
    ...(input.preheader ? { preheader: input.preheader } : {}),
    design: input.design,
    ...(c.eyebrow ? { eyebrow: c.eyebrow } : {}),
    heading: c.heading,
    paragraphs: c.paragraphs,
    ...(c.image ? { image: c.image } : {}),
    ...(c.cta ? { cta: c.cta } : {}),
    ...(c.signoff ? { signoff: c.signoff } : {}),
  };
}

/** HTML of the email as a subscriber would receive it (the picture goes through our image proxy for the preview). */
export async function previewCampaign(input: {
  subject?: string | undefined;
  preheader?: string | undefined;
  design: string;
  content: CampaignContent;
}): Promise<string> {
  const base = siteUrl();
  const data = emailData({
    subject: input.subject ?? "Preview",
    preheader: input.preheader ?? "",
    design: input.design,
    content: {
      ...input.content,
      image: input.content.image
        ? {
            ...input.content.image,
            src: `${base}${optimizedImageUrl(input.content.image.src, 1080)}`,
          }
        : null,
    },
  });
  const { html } = await renderEmail("campaign", {
    ...data,
    unsubscribeUrl: `${base}/unsubscribe`,
    oneClickUrl: `${base}/api/newsletter/unsubscribe`,
  });
  return html;
}

/** Sends the campaign to ONE address (the signed-in admin) so it can be checked in a real mailbox. */
export async function sendTest(id: string, to: string): Promise<void> {
  const campaign = await getCampaign(id);
  const base = siteUrl();
  const token = encodeURIComponent(createUnsubscribeToken(to));
  const queued = await enqueueEmail(
    "campaign",
    to,
    {
      ...emailData({ ...campaign, content: campaign.content }),
      subject: `[Test] ${campaign.subject}`,
      unsubscribeUrl: `${base}/unsubscribe?token=${token}`,
      oneClickUrl: `${base}/api/newsletter/unsubscribe?token=${token}`,
    },
    { dedupeKey: `campaign-test:${id}:${to}:${Date.now()}` },
  );
  if (!queued) throw new AppError(500, "test_not_queued", "The test email couldn't be queued.");
}

async function runSend(record: CampaignRecord): Promise<void> {
  const content = campaignContentSchema.parse(record.content);
  const result = await enqueueCampaign({
    campaignId: String(record._id),
    subject: record.subject,
    ...(record.preheader ? { preheader: record.preheader } : {}),
    heading: content.heading,
    paragraphs: content.paragraphs,
    ...(content.cta ? { cta: content.cta } : {}),
    design: record.design,
    ...(content.eyebrow ? { eyebrow: content.eyebrow } : {}),
    ...(content.image ? { image: content.image } : {}),
    ...(content.signoff ? { signoff: content.signoff } : {}),
  });
  await Campaign.updateOne(
    { _id: record._id },
    {
      $set: { status: "sent", sentAt: new Date(), queued: result.queued, skipped: result.skipped },
    },
  );
}

/**
 * Sends to every confirmed subscriber. Claimed atomically (draft/scheduled -> sending) so two clicks or two cron
 * runs can't both send it; per-recipient dedupe keys make a resumed send safe as well.
 */
export async function sendCampaign(actorId: string, id: string): Promise<CampaignDetail> {
  await connectDb();
  if ((await audienceSize()) === 0)
    throw badRequest("There are no confirmed subscribers to send to yet.", "no_audience");
  const claimed = await Campaign.findOneAndUpdate(
    { _id: oid(id), status: { $in: ["draft", "scheduled"] } },
    {
      $set: {
        status: "sending",
        sendStartedAt: new Date(),
        updatedBy: new Types.ObjectId(actorId),
      },
      $unset: { scheduledAt: 1 },
    },
    { new: true },
  ).lean();
  if (!claimed) {
    const exists = await Campaign.exists({ _id: oid(id) });
    if (!exists) throw notFound("Campaign not found", "campaign_not_found");
    throw conflict("This campaign is already being sent or was sent.", "campaign_locked");
  }
  await runSend(claimed);
  return getCampaign(id);
}

export async function scheduleCampaign(
  actorId: string,
  id: string,
  at: Date,
): Promise<CampaignDetail> {
  if (at.getTime() < Date.now() + MIN_LEAD_MINUTES * 60_000)
    throw badRequest(
      `Choose a time at least ${MIN_LEAD_MINUTES} minutes from now.`,
      "schedule_too_soon",
    );
  await connectDb();
  const updated = await Campaign.findOneAndUpdate(
    { _id: oid(id), status: { $in: ["draft", "scheduled"] } },
    { $set: { status: "scheduled", scheduledAt: at, updatedBy: new Types.ObjectId(actorId) } },
    { new: true },
  ).lean();
  if (!updated) throw conflict("This campaign can't be scheduled any more.", "campaign_locked");
  return toDetail(updated);
}

export async function unscheduleCampaign(actorId: string, id: string): Promise<CampaignDetail> {
  await connectDb();
  const updated = await Campaign.findOneAndUpdate(
    { _id: oid(id), status: "scheduled" },
    {
      $set: { status: "draft", updatedBy: new Types.ObjectId(actorId) },
      $unset: { scheduledAt: 1 },
    },
    { new: true },
  ).lean();
  if (!updated) throw conflict("This campaign isn't scheduled.", "campaign_locked");
  return toDetail(updated);
}

/**
 * Cron: sends campaigns whose time has come, and resumes any that was interrupted mid-send (the per-recipient
 * dedupe keys make resuming safe). Returns how many campaigns it handled.
 */
export async function sendDueCampaigns(): Promise<number> {
  await connectDb();
  const now = new Date();
  let handled = 0;
  for (;;) {
    const claimed = await Campaign.findOneAndUpdate(
      {
        $or: [
          { status: "scheduled", scheduledAt: { $lte: now } },
          { status: "sending", sendStartedAt: { $lte: new Date(now.getTime() - 10 * 60_000) } },
        ],
      },
      { $set: { status: "sending", sendStartedAt: new Date() } },
      { new: true },
    ).lean();
    if (!claimed) break;
    try {
      await runSend(claimed);
      handled++;
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error.message : String(error), id: String(claimed._id) },
        "Scheduled campaign failed to send",
      );
      break;
    }
  }
  return handled;
}
