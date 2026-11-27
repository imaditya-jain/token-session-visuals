import "server-only";

import { Schema, type Types } from "mongoose";

import { REEL_STATUSES, REEL_TOPICS, type ReelStatus, type ReelTopic } from "@/lib/reels";
import { defineModel } from "@/server/db/define-model";

export type ReelRecord = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  kind: "image" | "video";
  /** Object path inside the bucket. The public address is derived from it, never stored. */
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  durationMs?: number;
  caption: string;
  topic: ReelTopic;
  /** Product handles only; names, prices and stock are read live from the catalogue. */
  productHandles: string[];
  status: ReelStatus;
  likeCount: number;
  commentCount: number;
  reportCount: number;
  createdAt: Date;
  approvedAt?: Date;
  /** Set once, when the reel first goes live: after this it is hidden and then deleted. */
  expiresAt?: Date;
  moderatedBy?: Types.ObjectId;
};

const reelSchema = new Schema<ReelRecord>({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  kind: { type: String, enum: ["image", "video"], required: true },
  storagePath: { type: String, required: true, unique: true },
  contentType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  durationMs: { type: Number },
  caption: { type: String, default: "", maxlength: 300 },
  topic: { type: String, enum: REEL_TOPICS, required: true },
  productHandles: { type: [String], default: [] },
  status: { type: String, enum: REEL_STATUSES, required: true, default: "uploading" },
  likeCount: { type: Number, default: 0, min: 0 },
  commentCount: { type: Number, default: 0, min: 0 },
  reportCount: { type: Number, default: 0, min: 0 },
  createdAt: { type: Date, required: true, default: () => new Date() },
  approvedAt: { type: Date },
  expiresAt: { type: Date },
  moderatedBy: { type: Schema.Types.ObjectId },
});
// Feed: approved reels, newest first. Moderation queue: by status.
reelSchema.index({ status: 1, _id: -1 });
reelSchema.index({ status: 1, topic: 1, _id: -1 });
// "My reels" list.
reelSchema.index({ userId: 1, createdAt: -1 });
reelSchema.index({ expiresAt: 1 });

export const Reel = defineModel<ReelRecord>("Reel", reelSchema);

export type ReelCommentRecord = {
  _id: Types.ObjectId;
  reelId: Types.ObjectId;
  userId: Types.ObjectId;
  text: string;
  createdAt: Date;
};

const commentSchema = new Schema<ReelCommentRecord>({
  reelId: { type: Schema.Types.ObjectId, required: true },
  userId: { type: Schema.Types.ObjectId, required: true },
  text: { type: String, required: true, maxlength: 300 },
  createdAt: { type: Date, required: true, default: () => new Date() },
});
commentSchema.index({ reelId: 1, createdAt: -1 });
commentSchema.index({ userId: 1 });

export const ReelComment = defineModel<ReelCommentRecord>("ReelComment", commentSchema);

export type ReelLikeRecord = { reelId: Types.ObjectId; userId: Types.ObjectId; createdAt: Date };

const likeSchema = new Schema<ReelLikeRecord>({
  reelId: { type: Schema.Types.ObjectId, required: true },
  userId: { type: Schema.Types.ObjectId, required: true },
  createdAt: { type: Date, required: true, default: () => new Date() },
});
likeSchema.index({ reelId: 1, userId: 1 }, { unique: true });
likeSchema.index({ userId: 1 });

export const ReelLike = defineModel<ReelLikeRecord>("ReelLike", likeSchema);

export type ReelReportRecord = {
  reelId: Types.ObjectId;
  commentId?: Types.ObjectId;
  userId: Types.ObjectId;
  reason: string;
  createdAt: Date;
};

const reportSchema = new Schema<ReelReportRecord>({
  reelId: { type: Schema.Types.ObjectId, required: true },
  commentId: { type: Schema.Types.ObjectId },
  userId: { type: Schema.Types.ObjectId, required: true },
  reason: { type: String, required: true },
  createdAt: { type: Date, required: true, default: () => new Date() },
});
// One report per person per target.
reportSchema.index({ reelId: 1, commentId: 1, userId: 1 }, { unique: true });

export const ReelReport = defineModel<ReelReportRecord>("ReelReport", reportSchema);

export type ReelProfileRecord = {
  userId: Types.ObjectId;
  /** Public, random handle used in URLs and API calls instead of the account id. */
  publicId: string;
  /** A private account's reels and posts are visible only to people it accepted as followers. */
  isPrivate: boolean;
  createdAt: Date;
};

const profileSchema = new Schema<ReelProfileRecord>({
  userId: { type: Schema.Types.ObjectId, required: true, unique: true },
  publicId: { type: String, required: true, unique: true },
  isPrivate: { type: Boolean, required: true, default: false },
  createdAt: { type: Date, required: true, default: () => new Date() },
});
profileSchema.index({ isPrivate: 1 });

export const ReelProfile = defineModel<ReelProfileRecord>("ReelProfile", profileSchema);

export type FollowRecord = {
  followerId: Types.ObjectId;
  followeeId: Types.ObjectId;
  status: "requested" | "accepted";
  createdAt: Date;
};

const followSchema = new Schema<FollowRecord>({
  followerId: { type: Schema.Types.ObjectId, required: true },
  followeeId: { type: Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ["requested", "accepted"], required: true },
  createdAt: { type: Date, required: true, default: () => new Date() },
});
followSchema.index({ followerId: 1, followeeId: 1 }, { unique: true });
followSchema.index({ followeeId: 1, status: 1 });
followSchema.index({ followerId: 1, status: 1 });

export const Follow = defineModel<FollowRecord>("Follow", followSchema);
