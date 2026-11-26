import "server-only";

import { Schema, type Types } from "mongoose";

import { defineModel } from "@/server/db/define-model";

export type PlantDiagnosisRecord = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  plantName: string;
  health: string;
  summary: string;
  /** The diagnosis as shown to the customer (text only: the photo itself is never stored). */
  result: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
  createdAt: Date;
  /** TTL: a check is kept for six months, or until the customer deletes it. */
  expireAt: Date;
};

const schema = new Schema<PlantDiagnosisRecord>({
  userId: { type: Schema.Types.ObjectId, required: true },
  plantName: { type: String, required: true, maxlength: 200 },
  health: { type: String, required: true, maxlength: 40 },
  summary: { type: String, required: true, maxlength: 1500 },
  result: { type: Schema.Types.Mixed, required: true },
  model: { type: String, required: true, maxlength: 80 },
  inputTokens: { type: Number, required: true, default: 0 },
  outputTokens: { type: Number, required: true, default: 0 },
  createdAt: { type: Date, required: true, default: () => new Date() },
  expireAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});
schema.index({ userId: 1, createdAt: -1 });

export const PlantDiagnosis = defineModel<PlantDiagnosisRecord>("PlantDiagnosis", schema);
