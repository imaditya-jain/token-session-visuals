import "server-only";

import { randomBytes } from "node:crypto";

import { Types } from "mongoose";

import type { FollowRequestDto, FollowStatus } from "@/lib/reels";
import { connectDb } from "@/server/db/connection";
import { Follow, ReelProfile, type ReelProfileRecord } from "@/server/db/models/reel";
import { User } from "@/server/db/models/user";
import { badRequest, notFound } from "@/server/http/errors";

const oid = (value: string) => new Types.ObjectId(value);
const KEY = /^[a-f0-9]{16}$/;

const newKey = () => randomBytes(8).toString("hex");

/** Every account that takes part gets a profile on first use: a random public handle and a privacy setting. */
export async function ensureProfile(userId: string): Promise<ReelProfileRecord> {
  await connectDb();
  const found = await ReelProfile.findOne({ userId: oid(userId) }).lean();
  if (found) return found;
  const created = await ReelProfile.findOneAndUpdate(
    { userId: oid(userId) },
    { $setOnInsert: { publicId: newKey(), isPrivate: false, createdAt: new Date() } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return created as ReelProfileRecord;
}

export async function profileByKey(key: string): Promise<ReelProfileRecord> {
  if (!KEY.test(key)) throw notFound("We couldn't find that profile.", "profile_not_found");
  await connectDb();
  const profile = await ReelProfile.findOne({ publicId: key }).lean();
  if (!profile) throw notFound("We couldn't find that profile.", "profile_not_found");
  return profile;
}

/** People this viewer follows (accepted only). A pending request grants nothing. */
export async function followedAuthorIds(viewerId: string | null): Promise<Types.ObjectId[]> {
  if (!viewerId) return [];
  await connectDb();
  const rows = await Follow.find({ followerId: oid(viewerId), status: "accepted" })
    .select("followeeId")
    .lean();
  return rows.map((row) => row.followeeId);
}

/**
 * Accounts whose content this viewer must not see: private accounts they are not accepted by. The viewer's own
 * account is never hidden from them.
 */
export async function hiddenAuthorIds(viewerId: string | null): Promise<Types.ObjectId[]> {
  await connectDb();
  const [priv, allowed] = await Promise.all([
    ReelProfile.find({ isPrivate: true }).select("userId").lean(),
    followedAuthorIds(viewerId),
  ]);
  const ok = new Set([...allowed.map(String), ...(viewerId ? [viewerId] : [])]);
  return priv.map((row) => row.userId).filter((id) => !ok.has(String(id)));
}

export async function canViewAuthor(
  viewerId: string | null,
  authorId: Types.ObjectId,
): Promise<boolean> {
  if (viewerId && String(authorId) === viewerId) return true;
  await connectDb();
  const profile = await ReelProfile.findOne({ userId: authorId }).select("isPrivate").lean();
  if (!profile?.isPrivate) return true;
  if (!viewerId) return false;
  return Boolean(
    await Follow.exists({ followerId: oid(viewerId), followeeId: authorId, status: "accepted" }),
  );
}

export async function followStatusFor(
  viewerId: string | null,
  authorId: Types.ObjectId,
): Promise<FollowStatus> {
  if (!viewerId) return "none";
  if (String(authorId) === viewerId) return "self";
  await connectDb();
  const row = await Follow.findOne({ followerId: oid(viewerId), followeeId: authorId })
    .select("status")
    .lean();
  if (!row) return "none";
  return row.status === "accepted" ? "following" : "requested";
}

/** Follows a public account at once, or asks a private one. Idempotent; never downgrades an accepted follow. */
export async function follow(viewerId: string, key: string): Promise<FollowStatus> {
  const target = await profileByKey(key);
  if (String(target.userId) === viewerId)
    throw badRequest("You can't follow yourself.", "cannot_follow_self");
  await ensureProfile(viewerId);
  const status = target.isPrivate ? "requested" : "accepted";
  await Follow.updateOne(
    { followerId: oid(viewerId), followeeId: target.userId },
    { $setOnInsert: { status, createdAt: new Date() } },
    { upsert: true },
  );
  return followStatusFor(viewerId, target.userId);
}

/** Unfollows, or withdraws a pending request. Not following is not an error. */
export async function unfollow(viewerId: string, key: string): Promise<FollowStatus> {
  const target = await profileByKey(key);
  await Follow.deleteOne({ followerId: oid(viewerId), followeeId: target.userId });
  return "none";
}

export async function setPrivacy(
  userId: string,
  isPrivate: boolean,
): Promise<{ isPrivate: boolean }> {
  const profile = await ensureProfile(userId);
  await ReelProfile.updateOne({ userId: profile.userId }, { $set: { isPrivate } });
  // Going public means there is nothing left to approve.
  if (!isPrivate) {
    await Follow.updateMany(
      { followeeId: profile.userId, status: "requested" },
      { $set: { status: "accepted" } },
    );
  }
  return { isPrivate };
}

export async function listRequests(userId: string): Promise<FollowRequestDto[]> {
  await connectDb();
  const rows = await Follow.find({ followeeId: oid(userId), status: "requested" })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  const ids = rows.map((row) => row.followerId);
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: ids } })
      .select("firstName lastName")
      .lean(),
    ReelProfile.find({ userId: { $in: ids } })
      .select("userId publicId")
      .lean(),
  ]);
  const name = new Map(
    users.map((u) => [String(u._id), `${u.firstName} ${u.lastName.charAt(0)}.`.trim()]),
  );
  const key = new Map(profiles.map((p) => [String(p.userId), p.publicId]));
  return rows.flatMap((row) => {
    const publicId = key.get(String(row.followerId));
    return publicId
      ? [
          {
            key: publicId,
            name: name.get(String(row.followerId)) ?? "Fernwood member",
            createdAt: row.createdAt.toISOString(),
          },
        ]
      : [];
  });
}

/** Only the account being followed can answer a request, and only for requests addressed to it. */
export async function answerRequest(
  userId: string,
  followerKey: string,
  approve: boolean,
): Promise<void> {
  const follower = await profileByKey(followerKey);
  const filter = {
    followerId: follower.userId,
    followeeId: oid(userId),
    status: "requested" as const,
  };
  const { matchedCount } = approve
    ? await Follow.updateOne(filter, { $set: { status: "accepted" } })
    : await Follow.deleteOne(filter).then((r) => ({ matchedCount: r.deletedCount }));
  if (matchedCount === 0) throw notFound("There is no such request.", "request_not_found");
}

export async function eraseSocial(userId: string): Promise<void> {
  await connectDb();
  const id = oid(userId);
  await Promise.all([
    Follow.deleteMany({ $or: [{ followerId: id }, { followeeId: id }] }),
    ReelProfile.deleteOne({ userId: id }),
  ]);
}

export async function counts(
  userId: Types.ObjectId,
): Promise<{ followers: number; following: number }> {
  await connectDb();
  const [followers, following] = await Promise.all([
    Follow.countDocuments({ followeeId: userId, status: "accepted" }),
    Follow.countDocuments({ followerId: userId, status: "accepted" }),
  ]);
  return { followers, following };
}
