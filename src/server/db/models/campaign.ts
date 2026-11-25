import "server-only";

import { Schema, type Types } from "mongoose";

import type { CampaignContent, CampaignStatus } from "@/lib/campaigns";
import { defineModel } from "@/server/db/define-model";

export type CampaignRecord = {
  _id: Types.ObjectId;
  name: string;
  subject: string;
  preheader: string;
  design: string;
  content: CampaignContent;
  status: CampaignStatus;
  scheduledAt?: Date | undefined;
  sendStartedAt?: Date | undefined;
  sentAt?: Date | undefined;
  /** How many recipient emails were queued / refused (already queued) when it was sent. */
  queued?: number | undefined;
  skipped?: number | undefined;
  createdBy?: Types.ObjectId | undefined;
  updatedBy?: Types.ObjectId | undefined;
  createdAt: Date;
  updatedAt: Date;
};

const campaignSchema = new Schema<CampaignRecord>(
  {
    name: { type: String, required: true, maxlength: 120 },
    subject: { type: String, required: true, maxlength: 150 },
    preheader: { type: String, default: "", maxlength: 200 },
    design: { type: String, required: true, maxlength: 40 },
    content: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ["draft", "scheduled", "sending", "sent"],
      required: true,
      default: "draft",
    },
    scheduledAt: { type: Date },
    sendStartedAt: { type: Date },
    sentAt: { type: Date },
    queued: { type: Number },
    skipped: { type: Number },
    createdBy: { type: Schema.Types.ObjectId },
    updatedBy: { type: Schema.Types.ObjectId },
  },
  { timestamps: true, minimize: false },
);

campaignSchema.index({ status: 1, updatedAt: -1 });
campaignSchema.index({ status: 1, scheduledAt: 1 });

export const Campaign = defineModel<CampaignRecord>("Campaign", campaignSchema);
