import "server-only";

import { Schema } from "mongoose";

import { defineModel } from "@/server/db/define-model";

export type SubscriberStatus = "pending" | "subscribed" | "unsubscribed";
export type SubscriberSource = "footer" | "account" | "booking";

export type SubscriberRecord = {
  email: string;
  status: SubscriberStatus;
  source: SubscriberSource;
  /** When the person asked to subscribe (the consent record). */
  consentAt: Date;
  confirmedAt?: Date | undefined;
  unsubscribedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

const subscriberSchema = new Schema<SubscriberRecord>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    status: {
      type: String,
      enum: ["pending", "subscribed", "unsubscribed"],
      required: true,
      default: "pending",
    },
    source: { type: String, enum: ["footer", "account", "booking"], required: true },
    consentAt: { type: Date, required: true },
    confirmedAt: { type: Date },
    unsubscribedAt: { type: Date },
  },
  { timestamps: true },
);

subscriberSchema.index({ status: 1, _id: 1 });

export const Subscriber = defineModel<SubscriberRecord>("Subscriber", subscriberSchema);
