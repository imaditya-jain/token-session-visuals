import "server-only";

import { Schema, type Types } from "mongoose";

import { defineModel } from "@/server/db/define-model";

/**
 * One document per piece of site-wide content ("chrome" = header, footer, social links, announcement). Editors work
 * on `draft`; the storefront only ever reads `published`, so half-finished edits are never visible.
 */
export type SiteSettingRecord = {
  _id: Types.ObjectId;
  key: string;
  draft: unknown;
  published?: unknown;
  publishedAt?: Date | undefined;
  publishedBy?: Types.ObjectId | undefined;
  updatedBy?: Types.ObjectId | undefined;
  createdAt: Date;
  updatedAt: Date;
};

const siteSettingSchema = new Schema<SiteSettingRecord>(
  {
    key: { type: String, required: true, unique: true, maxlength: 40 },
    draft: { type: Schema.Types.Mixed, required: true },
    published: { type: Schema.Types.Mixed },
    publishedAt: { type: Date },
    publishedBy: { type: Schema.Types.ObjectId },
    updatedBy: { type: Schema.Types.ObjectId },
  },
  { timestamps: true, minimize: false },
);

export const SiteSetting = defineModel<SiteSettingRecord>("SiteSetting", siteSettingSchema);
