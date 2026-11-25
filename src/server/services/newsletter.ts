import "server-only";

import { createUnsubscribeToken, readUnsubscribeToken } from "@/server/auth/tokens";
import { siteUrl } from "@/server/config/env";
import { connectDb } from "@/server/db/connection";
import { Subscriber, type SubscriberSource } from "@/server/db/models/subscriber";
import { User } from "@/server/db/models/user";
import { enqueueEmail } from "@/server/email/outbox";
import { badRequest } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { enqueueMarketingSync } from "@/server/queue/producers";
import { consumeAuthToken, issueAuthToken } from "@/server/services/auth-tokens";

/**
 * Starts (or restarts) a double opt-in subscription. Always resolves the same way, so the endpoint can't be
 * used to learn who is already subscribed. Nobody receives marketing until they click the confirmation link.
 */
export async function subscribe(email: string, source: SubscriberSource): Promise<void> {
  await connectDb();
  const now = new Date();
  const existing = await Subscriber.findOne({ email }).lean();
  if (existing?.status === "subscribed") return;

  const subscriber = await Subscriber.findOneAndUpdate(
    { email },
    { $set: { status: "pending", source, consentAt: now }, $unset: { unsubscribedAt: 1 } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  if (!subscriber) throw new Error("Could not save subscriber");

  const token = await issueAuthToken(subscriber._id, "newsletter_confirm");
  const url = `${siteUrl()}/newsletter/confirm?token=${encodeURIComponent(token)}`;
  await enqueueEmail("newsletter-confirm", email, { url });
}

export async function confirmSubscription(rawToken: string): Promise<void> {
  const subscriberId = await consumeAuthToken(rawToken, "newsletter_confirm");
  if (!subscriberId)
    throw badRequest("This confirmation link is invalid or has expired.", "invalid_token");
  await Subscriber.updateOne(
    { _id: subscriberId },
    { $set: { status: "subscribed", confirmedAt: new Date() }, $unset: { unsubscribedAt: 1 } },
  );
  await enqueueMarketingSync(String(subscriberId));
}

/** Idempotent. Also switches off the marketing preference on a matching account. */
export async function unsubscribe(rawToken: string): Promise<void> {
  const email = readUnsubscribeToken(rawToken);
  if (!email) throw badRequest("This unsubscribe link is invalid.", "invalid_token");
  await connectDb();
  const changed = await Subscriber.findOneAndUpdate(
    { email, status: { $ne: "unsubscribed" } },
    { $set: { status: "unsubscribed", unsubscribedAt: new Date() } },
    { projection: { _id: 1 } },
  ).lean();
  await User.updateOne({ email }, { $set: { acceptsMarketing: false } });
  if (changed) await enqueueMarketingSync(String(changed._id));
}

/**
 * Keeps the mailing list in step with an account's marketing preference. Turning it on only subscribes
 * verified accounts (the verified mailbox plus the explicit choice is the double opt-in).
 */
export async function syncMarketingConsent(email: string, accepts: boolean): Promise<void> {
  await connectDb();
  const now = new Date();
  if (accepts) {
    const subscriber = await Subscriber.findOneAndUpdate(
      { email },
      {
        $set: { status: "subscribed", confirmedAt: now },
        $setOnInsert: { source: "account", consentAt: now },
        $unset: { unsubscribedAt: 1 },
      },
      { upsert: true, returnDocument: "after", projection: { _id: 1 } },
    ).lean();
    if (subscriber) await enqueueMarketingSync(String(subscriber._id));
    return;
  }
  const changed = await Subscriber.findOneAndUpdate(
    { email, status: { $ne: "unsubscribed" } },
    { $set: { status: "unsubscribed", unsubscribedAt: now } },
    { projection: { _id: 1 } },
  ).lean();
  if (changed) await enqueueMarketingSync(String(changed._id));
}

export type CampaignInput = {
  /** Stable id for this send; makes re-running a campaign idempotent per recipient. */
  campaignId: string;
  subject: string;
  preheader?: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  design?: string;
  eyebrow?: string;
  image?: { src: string; alt: string };
  signoff?: string;
};

const BATCH = 200;

/**
 * Queues a campaign email for every confirmed subscriber. Delivery happens through the email outbox
 * (retries, backoff). Internal service: the future admin panel calls this; it is not exposed over HTTP.
 */
export async function enqueueCampaign(
  input: CampaignInput,
): Promise<{ queued: number; skipped: number }> {
  await connectDb();
  const base = siteUrl();
  let queued = 0;
  let skipped = 0;
  let lastId: unknown;

  for (;;) {
    const batch = await Subscriber.find({
      status: "subscribed",
      ...(lastId ? { _id: { $gt: lastId } } : {}),
    })
      .sort({ _id: 1 })
      .limit(BATCH)
      .select("email")
      .lean();
    if (batch.length === 0) break;

    for (const subscriber of batch) {
      const token = encodeURIComponent(createUnsubscribeToken(subscriber.email));
      const id = await enqueueEmail(
        "campaign",
        subscriber.email,
        {
          subject: input.subject,
          ...(input.preheader ? { preheader: input.preheader } : {}),
          heading: input.heading,
          paragraphs: input.paragraphs,
          ...(input.cta ? { cta: input.cta } : {}),
          ...(input.design ? { design: input.design } : {}),
          ...(input.eyebrow ? { eyebrow: input.eyebrow } : {}),
          ...(input.image ? { image: input.image } : {}),
          ...(input.signoff ? { signoff: input.signoff } : {}),
          unsubscribeUrl: `${base}/unsubscribe?token=${token}`,
          oneClickUrl: `${base}/api/newsletter/unsubscribe?token=${token}`,
        },
        { dedupeKey: `campaign:${input.campaignId}:${subscriber.email}` },
      ).catch((error: unknown) => {
        logger.error(
          { err: error, campaignId: input.campaignId },
          "Could not queue campaign email",
        );
        return null;
      });
      if (id) queued++;
      else skipped++;
    }
    lastId = batch[batch.length - 1]!._id;
  }
  return { queued, skipped };
}
