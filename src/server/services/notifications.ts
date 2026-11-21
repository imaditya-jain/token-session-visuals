import "server-only";

import { Types } from "mongoose";

import { emailEnv, siteUrl } from "@/server/config/env";
import { connectDb } from "@/server/db/connection";
import { Notification, type NotificationKind } from "@/server/db/models/notification";
import { User } from "@/server/db/models/user";
import { enqueueEmail } from "@/server/email/outbox";
import { logger } from "@/server/logger";

const RETENTION_MS = 90 * 24 * 3600 * 1000;

type Order = { gid: string; name: string; userId: Types.ObjectId };

/** Customer-facing wording for each event. Plain, specific, and honest about what has (not) happened yet. */
const COPY: Record<
  NotificationKind,
  { title: (name: string) => string; body: string; email: boolean }
> = {
  "order.placed": {
    title: (name) => `Order ${name} received`,
    body: "Thank you for your order. We'll let you know as soon as it ships.",
    email: true,
  },
  "order.paid": {
    title: (name) => `Payment received for order ${name}`,
    body: "Your payment went through. We're getting your plants ready.",
    email: false, // Shopify's own order confirmation already covers this moment
  },
  "order.shipped": {
    title: (name) => `Order ${name} is on its way`,
    body: "Your order has shipped. Open the order to see its status.",
    email: true,
  },
  "order.cancelled": {
    title: (name) => `Order ${name} was cancelled`,
    body: "This order was cancelled. If you didn't expect this, please contact us.",
    email: true,
  },
};

/** The numeric order id, which is what `/account/orders/[id]` takes. */
const orderPath = (gid: string): string => `/account/orders/${gid.split("/").pop() ?? ""}`;

/**
 * Records customer-facing order events as in-app notifications and, only when `ORDER_EMAIL_NOTIFICATIONS=true`,
 * as branded emails. Email is opt-in because Shopify already sends its own order emails by default: turn this on
 * only after switching those off in Shopify (Settings > Notifications), or customers get every message twice.
 * Never throws: a notification problem must not fail the order sync that triggered it.
 */
export async function notifyOrderEvents(order: Order, events: NotificationKind[]): Promise<void> {
  if (events.length === 0) return;
  try {
    await connectDb();
    const now = new Date();
    const link = orderPath(order.gid);

    const created: NotificationKind[] = [];
    for (const kind of events) {
      const copy = COPY[kind];
      try {
        await Notification.create({
          userId: order.userId,
          kind,
          title: copy.title(order.name),
          body: copy.body,
          link,
          dedupeKey: `${order.gid}:${kind}`,
          expireAt: new Date(now.getTime() + RETENTION_MS),
        });
        created.push(kind);
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error; // already notified: skip silently
      }
    }

    const wantsEmail = created.filter((kind) => COPY[kind].email);
    if (wantsEmail.length === 0 || !orderEmailsEnabled()) return;

    const user = await User.findById(order.userId).select("email firstName").lean();
    if (!user) return;
    for (const kind of wantsEmail) {
      const copy = COPY[kind];
      await enqueueEmail(
        "order-update",
        user.email,
        {
          firstName: user.firstName,
          orderName: order.name,
          headline: copy.title(order.name),
          message: copy.body,
          url: `${siteUrl()}${link}`,
        },
        { dedupeKey: `order-email:${order.gid}:${kind}` },
      );
    }
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error : String(error), orderGid: order.gid },
      "Could not create order notifications",
    );
  }
}

function orderEmailsEnabled(): boolean {
  try {
    return emailEnv().ORDER_EMAIL_NOTIFICATIONS;
  } catch {
    return false; // email isn't configured at all
  }
}

export type NotificationDto = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  createdAt: string;
  read: boolean;
};

export async function listNotifications(userId: string, limit = 20) {
  await connectDb();
  const owner = new Types.ObjectId(userId);
  const [items, unreadCount] = await Promise.all([
    Notification.find({ userId: owner }).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ userId: owner, readAt: { $exists: false } }),
  ]);
  return {
    unreadCount,
    items: items.map((item): NotificationDto => ({
      id: String(item._id),
      kind: item.kind,
      title: item.title,
      body: item.body,
      link: item.link,
      createdAt: item.createdAt.toISOString(),
      read: item.readAt !== undefined,
    })),
  };
}

/** Marks notifications read: specific ids (only ever the caller's own) or everything unread. */
export async function markNotificationsRead(
  userId: string,
  ids: string[] | "all",
): Promise<number> {
  await connectDb();
  const filter =
    ids === "all"
      ? { userId: new Types.ObjectId(userId), readAt: { $exists: false } }
      : {
          userId: new Types.ObjectId(userId),
          _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
          readAt: { $exists: false },
        };
  const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  return result.modifiedCount;
}
