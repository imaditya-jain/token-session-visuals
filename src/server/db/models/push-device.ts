import "server-only";

import { Schema, type Types } from "mongoose";

import { defineModel } from "@/server/db/define-model";

export const MAX_DEVICES_PER_USER = 10;

export type PushDeviceRecord = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** Expo push token of one installed app. It is an address, not a credential, but is still never logged or returned. */
  token: string;
  platform: "ios" | "android";
  createdAt: Date;
  lastSeenAt: Date;
};

const pushDeviceSchema = new Schema<PushDeviceRecord>({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  token: { type: String, required: true, unique: true, maxlength: 200 },
  platform: { type: String, enum: ["ios", "android"], required: true },
  createdAt: { type: Date, required: true, default: () => new Date() },
  lastSeenAt: { type: Date, required: true, default: () => new Date() },
});

export const PushDevice = defineModel<PushDeviceRecord>("PushDevice", pushDeviceSchema);
