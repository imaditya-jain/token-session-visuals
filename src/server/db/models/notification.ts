import "server-only";

import { Schema, type Types } from "mongoose";

import { defineModel } from "@/server/db/define-model";

export type NotificationKind = "order.placed" | "order.paid" | "order.shipped" | "order.cancelled";

export type NotificationRecord = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Site-relative page the notification is about. */
  link: string;
  /** One notification per event: the same webhook or backfill delivered twice never doubles it. */
  dedupeKey: string;
  readAt?: Date | undefined;
  createdAt: Date;
  /** TTL: notifications are short-lived; the orders themselves are the lasting record. */
  expireAt: Date;
};

const notificationSchema = new Schema<NotificationRecord>({
  userId: { type: Schema.Types.ObjectId, required: true },
  kind: {
    type: String,
    enum: ["order.placed", "order.paid", "order.shipped", "order.cancelled"],
    required: true,
  },
  title: { type: String, required: true, maxlength: 200 },
  body: { type: String, required: true, maxlength: 500 },
  link: { type: String, required: true, maxlength: 200 },
  dedupeKey: { type: String, required: true },
  readAt: { type: Date },
  createdAt: { type: Date, required: true, default: () => new Date() },
  expireAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });

export const Notification = defineModel<NotificationRecord>("Notification", notificationSchema);
