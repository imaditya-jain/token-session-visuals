import "server-only";

import { randomUUID } from "node:crypto";

import { Types } from "mongoose";

import { getProduct, getProducts } from "@/data/catalog";
import {
  type CreateReelInput,
  REEL_LIMITS,
  type ReelCommentDto,
  type AuthorProfileDto,
  type ReelDto,
  type ReelProductDto,
  type ReelStatus,
  type ReelTopic,
} from "@/lib/reels";
import { connectDb } from "@/server/db/connection";
import {
  canViewAuthor,
  counts,
  eraseSocial,
  ensureProfile,
  followedAuthorIds,
  followStatusFor,
  hiddenAuthorIds,
  profileByKey,
} from "@/server/services/reel-social";
import {
  Follow,
  Reel,
  ReelComment,
  type ReelCommentRecord,
  ReelLike,
  ReelProfile,
  ReelReport,
  type ReelRecord,
} from "@/server/db/models/reel";
import { User } from "@/server/db/models/user";
import { AppError, conflict, forbidden, notFound, unauthorized } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { sniffMedia } from "@/server/reels/sniff";
import {
  createSignedUpload,
  probeObject,
  publicUrl,
  reelsConfigured,
  removeObjects,
  type SignedUpload,
} from "@/server/supabase/storage";

export const FEED_PAGE_SIZE = 10;
/** Distinct people who must report an approved reel before it is pulled back for review. */
const AUTO_HOLD_REPORTS = 3;
/** An upload that was never completed is abandoned after this long. */
const ABANDONED_AFTER_MS = 60 * 60 * 1000;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

const oid = (value: string) => new Types.ObjectId(value);
const isObjectId = (value: string) => /^[a-f0-9]{24}$/.test(value);
const parseId = (value: string): Types.ObjectId => {
  if (!isObjectId(value)) throw notFound("We couldn't find that reel.", "reel_not_found");
  return oid(value);
};

export function assertReelsOn(): void {
  if (!reelsConfigured())
    throw new AppError(503, "reels_not_configured", "Reels are not switched on yet.");
}

/** Posting and commenting are public: only people who proved they own their mailbox may do either. */
async function requireVerified(userId: string): Promise<void> {
  await connectDb();
  const user = await User.findById(userId).select("emailVerifiedAt").lean();
  if (!user) throw unauthorized("Account not found", "session_revoked");
  if (!user.emailVerifiedAt) {
    throw forbidden("Confirm your email address to post and comment.", "email_unverified");
  }
}

/** First name and the initial of the last name: enough to be friendly, not enough to identify someone. */
async function authorNames(userIds: Types.ObjectId[]): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.map(String))].map(oid);
  const users = await User.find({ _id: { $in: unique } })
    .select("firstName lastName")
    .lean();
  return new Map(
    users.map((user) => [String(user._id), `${user.firstName} ${user.lastName.charAt(0)}.`.trim()]),
  );
}

async function productMap(handles: string[]): Promise<Map<string, ReelProductDto>> {
  if (handles.length === 0) return new Map();
  const wanted = new Set(handles);
  const products = await getProducts();
  return new Map(
    products
      .filter((product) => wanted.has(product.slug))
      .map((product) => [
        product.slug,
        {
          handle: product.slug,
          name: product.name,
          price: product.price,
          image: product.image,
          inStock: product.inStock,
        },
      ]),
  );
}

async function toDtos(reels: ReelRecord[], viewerId: string | null): Promise<ReelDto[]> {
  if (reels.length === 0) return [];
  const [names, keys, follows, likes, products] = await Promise.all([
    authorNames(reels.map((reel) => reel.userId)),
    ReelProfile.find({
      userId: { $in: [...new Set(reels.map((reel) => String(reel.userId)))].map(oid) },
    })
      .select("userId publicId")
      .lean(),
    viewerId
      ? Follow.find({
          followerId: oid(viewerId),
          followeeId: { $in: [...new Set(reels.map((reel) => String(reel.userId)))].map(oid) },
        })
          .select("followeeId status")
          .lean()
      : Promise.resolve([]),
    viewerId
      ? ReelLike.find({ userId: oid(viewerId), reelId: { $in: reels.map((reel) => reel._id) } })
          .select("reelId")
          .lean()
      : Promise.resolve([]),
    productMap(reels.flatMap((reel) => reel.productHandles)),
  ]);
  const liked = new Set(likes.map((like) => String(like.reelId)));
  const followOf = new Map(follows.map((row) => [String(row.followeeId), row.status]));
  const keyOf = new Map(keys.map((row) => [String(row.userId), row.publicId]));
  return reels.map((reel) => ({
    id: String(reel._id),
    kind: reel.kind,
    format: reel.kind === "video" ? "reel" : "post",
    authorKey: keyOf.get(String(reel.userId)) ?? "",
    followStatus:
      viewerId !== null && String(reel.userId) === viewerId
        ? "self"
        : followOf.get(String(reel.userId)) === "accepted"
          ? "following"
          : followOf.get(String(reel.userId)) === "requested"
            ? "requested"
            : "none",
    mediaUrl: publicUrl(reel.storagePath),
    durationMs: reel.durationMs ?? null,
    caption: reel.caption,
    topic: reel.topic,
    author: names.get(String(reel.userId)) ?? "Fernwood member",
    mine: viewerId !== null && String(reel.userId) === viewerId,
    likes: reel.likeCount,
    comments: reel.commentCount,
    liked: liked.has(String(reel._id)),
    // Products removed from the shop since posting simply disappear; prices and stock are always live.
    products: reel.productHandles.flatMap((handle) => {
      const product = products.get(handle);
      return product ? [product] : [];
    }),
    status: reel.status,
    createdAt: reel.createdAt.toISOString(),
    expiresAt: reel.expiresAt?.toISOString() ?? null,
  }));
}

export type CreatedReel = { id: string; upload: SignedUpload };

/** Reserves a reel and returns the one-time address the file is uploaded to. Nothing is public yet. */
export async function createReel(userId: string, input: CreateReelInput): Promise<CreatedReel> {
  assertReelsOn();
  await requireVerified(userId);

  for (const handle of input.productHandles) {
    if (!(await getProduct(handle))) {
      throw new AppError(404, "product_not_found", "One of the linked products no longer exists.");
    }
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await Reel.countDocuments({ userId: oid(userId), createdAt: { $gte: since } });
  if (recent >= REEL_LIMITS.perUserDaily) {
    throw new AppError(
      429,
      "reel_daily_limit",
      "You've reached today's posting limit. Please try again tomorrow.",
    );
  }

  // Files are filed under the author's random public handle, never the account id: the address is public.
  const profile = await ensureProfile(userId);
  const storagePath = `${profile.publicId}/${randomUUID()}.${EXTENSIONS[input.contentType] ?? "bin"}`;
  const upload = await createSignedUpload(storagePath, input.contentType);
  const reel = await Reel.create({
    userId: oid(userId),
    kind: input.kind,
    storagePath,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    caption: input.caption,
    topic: input.topic,
    productHandles: input.productHandles,
    status: "uploading",
  });
  return { id: String(reel._id), upload };
}

/**
 * Called by the client after the upload. The declared size and type are claims, so the stored file is
 * measured and its first bytes inspected here; anything that doesn't match is deleted. Then the reel waits
 * for a moderator.
 */
export async function completeReel(userId: string, reelId: string): Promise<ReelDto> {
  assertReelsOn();
  const id = parseId(reelId);
  const reel = await Reel.findOne({ _id: id, userId: oid(userId) }).lean();
  if (!reel) throw notFound("We couldn't find that reel.", "reel_not_found");
  if (reel.status !== "uploading") return (await toDtos([reel], userId))[0] as ReelDto;

  const probe = await probeObject(reel.storagePath);
  if (!probe || probe.size === 0) {
    throw conflict(
      "The file hasn't arrived yet. Please upload it and try again.",
      "upload_missing",
    );
  }
  const limit = reel.kind === "image" ? REEL_LIMITS.imageBytes : REEL_LIMITS.videoBytes;
  const reject = async (message: string): Promise<never> => {
    await Promise.all([removeObjects([reel.storagePath]), Reel.deleteOne({ _id: id })]);
    throw new AppError(422, "upload_invalid", message);
  };
  if (probe.size > limit) {
    return reject(
      `${reel.kind === "image" ? "Pictures" : "Videos"} can be up to ${limit / 1024 / 1024} MB.`,
    );
  }
  if (sniffMedia(probe.head) !== reel.kind)
    return reject("That file isn't a supported picture or video.");

  const updated = await Reel.findOneAndUpdate(
    { _id: id, status: "uploading" },
    { $set: { status: "pending", sizeBytes: probe.size } },
    { returnDocument: "after" },
  ).lean();
  return (await toDtos([updated ?? reel], userId))[0] as ReelDto;
}

export type ReelPage = { reels: ReelDto[]; nextCursor: string | null };

/** Live = approved and, for a video reel, still inside its 24 hours. Photo posts never expire. */
const liveFilter = (now: Date) => ({
  status: "approved" as const,
  $or: [{ kind: "image" as const }, { expiresAt: { $gt: now } }],
});

const parseCursor = (
  cursor: string | undefined,
  fallback: "f" | "o",
): { phase: "f" | "o"; id?: Types.ObjectId } => {
  if (!cursor) return { phase: fallback };
  const match = /^([fo]):([a-f0-9]{24})$/.exec(cursor);
  if (!match) throw new AppError(400, "bad_cursor", "Invalid page marker.");
  return { phase: match[1] as "f" | "o", id: oid(match[2] as string) };
};

/**
 * The home feed, ranked like Instagram's: reels and posts from people you follow come first (newest first), then
 * everyone else's. Private accounts you are not accepted by never appear. The cursor remembers which of the two
 * groups it is in, so paging never repeats or skips an item.
 */
export async function listFeed(
  viewerId: string | null,
  options: { cursor?: string | undefined; topic?: ReelTopic | undefined },
): Promise<ReelPage> {
  assertReelsOn();
  await connectDb();
  const [hidden, followed] = await Promise.all([
    hiddenAuthorIds(viewerId),
    followedAuthorIds(viewerId),
  ]);
  const base = {
    ...liveFilter(new Date()),
    ...(options.topic ? { topic: options.topic } : {}),
  };
  const start = parseCursor(options.cursor, followed.length > 0 ? "f" : "o");

  const collected: ReelRecord[] = [];
  let phase = start.phase;
  let after = start.id;
  while (collected.length < FEED_PAGE_SIZE + 1) {
    const authors = phase === "f" ? { $in: followed } : { $nin: [...hidden, ...followed] };
    const rows = await Reel.find({
      ...base,
      userId: authors,
      ...(after ? { _id: { $lt: after } } : {}),
    })
      .sort({ _id: -1 })
      .limit(FEED_PAGE_SIZE + 1 - collected.length)
      .lean();
    collected.push(...(rows.map((row) => ({ ...row, __phase: phase })) as ReelRecord[]));
    if (rows.length > 0 && collected.length >= FEED_PAGE_SIZE + 1) break;
    if (phase === "o") break;
    phase = "o";
    after = undefined;
  }
  const page = collected.slice(0, FEED_PAGE_SIZE);
  const more = collected.length > FEED_PAGE_SIZE;
  const last = page.at(-1) as (ReelRecord & { __phase?: "f" | "o" }) | undefined;
  return {
    reels: await toDtos(page, viewerId),
    nextCursor: more && last ? `${last.__phase ?? phase}:${String(last._id)}` : null,
  };
}

export const AUTHOR_PAGE_SIZE = 24;

/** One person's profile and their live posts and reels. A private account shows only the counts to outsiders. */
export async function getAuthor(
  viewerId: string | null,
  key: string,
  cursor?: string,
): Promise<{ profile: AuthorProfileDto; reels: ReelDto[]; nextCursor: string | null }> {
  assertReelsOn();
  const target = await profileByKey(key);
  if (cursor !== undefined && !isObjectId(cursor))
    throw new AppError(400, "bad_cursor", "Invalid page marker.");
  const [user, social, status, allowed] = await Promise.all([
    User.findById(target.userId).select("firstName lastName").lean(),
    counts(target.userId),
    followStatusFor(viewerId, target.userId),
    canViewAuthor(viewerId, target.userId),
  ]);
  const rows = allowed
    ? await Reel.find({
        ...liveFilter(new Date()),
        userId: target.userId,
        ...(cursor ? { _id: { $lt: oid(cursor) } } : {}),
      })
        .sort({ _id: -1 })
        .limit(AUTHOR_PAGE_SIZE + 1)
        .lean()
    : [];
  const page = rows.slice(0, AUTHOR_PAGE_SIZE);
  const last = page.at(-1);
  const items = allowed
    ? await Reel.countDocuments({ ...liveFilter(new Date()), userId: target.userId })
    : 0;
  return {
    profile: {
      key: target.publicId,
      name: user ? `${user.firstName} ${user.lastName.charAt(0)}.`.trim() : "Fernwood member",
      isPrivate: target.isPrivate,
      ...social,
      items,
      followStatus: status,
      canView: allowed,
    },
    reels: await toDtos(page, viewerId),
    nextCursor: rows.length > AUTHOR_PAGE_SIZE && last ? String(last._id) : null,
  };
}

/** The person's own reels, every status, so they can see what is waiting or was declined. */
export async function listMine(userId: string): Promise<ReelDto[]> {
  assertReelsOn();
  await connectDb();
  const rows = await Reel.find({ userId: oid(userId), status: { $ne: "uploading" } })
    .sort({ _id: -1 })
    .limit(50)
    .lean();
  return toDtos(rows, userId);
}

/**
 * Visible to everyone (signed in or not) while live; before that, and once removed, only to the author.
 * An expired reel is gone for everyone, its author included. Anyone else gets a plain 404.
 */
async function visibleReel(userId: string | null, reelId: string): Promise<ReelRecord> {
  await connectDb();
  const reel = await Reel.findById(parseId(reelId)).lean();
  const own =
    reel !== null && reel !== undefined && userId !== null && String(reel.userId) === userId;
  const live =
    reel?.status === "approved" &&
    (reel.kind === "image" || (reel.expiresAt?.getTime() ?? 0) > Date.now());
  const awaiting =
    own && (reel.status === "pending" || reel.status === "rejected" || reel.status === "uploading");
  if (!reel || (!live && !awaiting))
    throw notFound("We couldn't find that reel.", "reel_not_found");
  // A private account's content is "not found" to everyone it hasn't accepted: nothing reveals that it exists.
  if (!own && !(await canViewAuthor(userId, reel.userId))) {
    throw notFound("We couldn't find that reel.", "reel_not_found");
  }
  return reel;
}

export async function getReel(userId: string | null, reelId: string): Promise<ReelDto> {
  assertReelsOn();
  return (await toDtos([await visibleReel(userId, reelId)], userId))[0] as ReelDto;
}

export async function deleteOwnReel(userId: string, reelId: string): Promise<void> {
  await connectDb();
  const reel = await Reel.findOne({ _id: parseId(reelId), userId: oid(userId) })
    .select("storagePath")
    .lean();
  if (!reel) throw notFound("We couldn't find that reel.", "reel_not_found");
  await purgeReels([reel]);
}

export async function setLike(
  userId: string,
  reelId: string,
  liked: boolean,
): Promise<{ liked: boolean; likes: number }> {
  assertReelsOn();
  const reel = await visibleReel(userId, reelId);
  if (reel.status !== "approved") throw conflict("This reel isn't public yet.", "reel_not_public");
  let delta = 0;
  if (liked) {
    const result = await ReelLike.updateOne(
      { reelId: reel._id, userId: oid(userId) },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    delta = result.upsertedCount;
  } else {
    delta = -(await ReelLike.deleteOne({ reelId: reel._id, userId: oid(userId) })).deletedCount;
  }
  const updated =
    delta === 0
      ? reel
      : await Reel.findByIdAndUpdate(
          reel._id,
          { $inc: { likeCount: delta } },
          { returnDocument: "after" },
        ).lean();
  return { liked, likes: Math.max(0, updated?.likeCount ?? reel.likeCount) };
}

async function toCommentDtos(
  rows: ReelCommentRecord[],
  viewerId: string | null,
): Promise<ReelCommentDto[]> {
  const names = await authorNames(rows.map((row) => row.userId));
  return rows.map((row) => ({
    id: String(row._id),
    text: row.text,
    author: names.get(String(row.userId)) ?? "Fernwood member",
    mine: viewerId !== null && String(row.userId) === viewerId,
    createdAt: row.createdAt.toISOString(),
  }));
}

export const COMMENT_PAGE_SIZE = 20;

export async function listComments(
  userId: string | null,
  reelId: string,
  cursor?: string,
): Promise<{ comments: ReelCommentDto[]; nextCursor: string | null }> {
  assertReelsOn();
  const reel = await visibleReel(userId, reelId);
  if (cursor !== undefined && !isObjectId(cursor))
    throw new AppError(400, "bad_cursor", "Invalid page marker.");
  const rows = await ReelComment.find({
    reelId: reel._id,
    ...(cursor ? { _id: { $lt: oid(cursor) } } : {}),
  })
    .sort({ _id: -1 })
    .limit(COMMENT_PAGE_SIZE + 1)
    .lean();
  const page = rows.slice(0, COMMENT_PAGE_SIZE);
  const last = page.at(-1);
  return {
    comments: await toCommentDtos(page, userId),
    nextCursor: rows.length > COMMENT_PAGE_SIZE && last ? String(last._id) : null,
  };
}

export async function addComment(
  userId: string,
  reelId: string,
  text: string,
): Promise<ReelCommentDto> {
  assertReelsOn();
  await requireVerified(userId);
  const reel = await visibleReel(userId, reelId);
  if (reel.status !== "approved") throw conflict("This reel isn't public yet.", "reel_not_public");
  const created = await ReelComment.create({ reelId: reel._id, userId: oid(userId), text });
  await Reel.updateOne({ _id: reel._id }, { $inc: { commentCount: 1 } });
  return (await toCommentDtos([created.toObject()], userId))[0] as ReelCommentDto;
}

/** The author of a comment and the owner of the reel it sits on may remove it. */
export async function deleteComment(
  userId: string,
  reelId: string,
  commentId: string,
): Promise<void> {
  await connectDb();
  const reel = await Reel.findById(parseId(reelId)).select("userId").lean();
  const comment = await ReelComment.findOne({
    _id: parseId(commentId),
    reelId: parseId(reelId),
  }).lean();
  if (!reel || !comment) throw notFound("We couldn't find that comment.", "comment_not_found");
  if (String(comment.userId) !== userId && String(reel.userId) !== userId) {
    throw notFound("We couldn't find that comment.", "comment_not_found");
  }
  await removeCommentRecord(comment);
}

async function removeCommentRecord(comment: ReelCommentRecord): Promise<void> {
  const { deletedCount } = await ReelComment.deleteOne({ _id: comment._id });
  await ReelReport.deleteMany({ commentId: comment._id });
  if (deletedCount > 0)
    await Reel.updateOne(
      { _id: comment.reelId, commentCount: { $gt: 0 } },
      { $inc: { commentCount: -1 } },
    );
}

/**
 * Reports are idempotent per person. Enough distinct reports pull an approved reel back to the review
 * queue until a moderator looks at it again.
 */
export async function reportReel(
  userId: string,
  reelId: string,
  reason: string,
  commentId?: string,
): Promise<void> {
  assertReelsOn();
  const reel = await visibleReel(userId, reelId);
  if (commentId) {
    const comment = await ReelComment.exists({ _id: parseId(commentId), reelId: reel._id });
    if (!comment) throw notFound("We couldn't find that comment.", "comment_not_found");
  }
  const filter = {
    reelId: reel._id,
    userId: oid(userId),
    commentId: commentId ? oid(commentId) : null,
  };
  const result = await ReelReport.updateOne(
    filter,
    { $setOnInsert: { reason, createdAt: new Date() } },
    { upsert: true },
  );
  if (result.upsertedCount === 0 || commentId) return;
  const updated = await Reel.findByIdAndUpdate(
    reel._id,
    { $inc: { reportCount: 1 } },
    { returnDocument: "after" },
  ).lean();
  if (updated && updated.status === "approved" && updated.reportCount >= AUTO_HOLD_REPORTS) {
    await Reel.updateOne(
      { _id: reel._id, status: "approved" },
      { $set: { status: "pending" }, $unset: { approvedAt: 1 } },
    );
    logger.warn({ reelId }, "Reel pulled back for review after repeated reports");
  }
}

// ---- Moderation (admin) ----

export type AdminReelPage = {
  reels: ReelDto[];
  nextCursor: string | null;
  counts: Record<string, number>;
};

export async function listForModeration(
  adminId: string,
  options: { status: ReelStatus; cursor?: string | undefined },
): Promise<AdminReelPage> {
  assertReelsOn();
  await connectDb();
  if (options.cursor !== undefined && !isObjectId(options.cursor)) {
    throw new AppError(400, "bad_cursor", "Invalid page marker.");
  }
  const rows = await Reel.find({
    status: options.status,
    ...(options.cursor ? { _id: { $lt: oid(options.cursor) } } : {}),
  })
    .sort({ _id: -1 })
    .limit(FEED_PAGE_SIZE + 1)
    .lean();
  const page = rows.slice(0, FEED_PAGE_SIZE);
  const last = page.at(-1);
  const grouped = await Reel.aggregate<{ _id: string; n: number }>([
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);
  return {
    reels: await toDtos(page, adminId),
    nextCursor: rows.length > FEED_PAGE_SIZE && last ? String(last._id) : null,
    counts: Object.fromEntries(grouped.map((row) => [row._id, row.n])),
  };
}

export async function moderateReel(
  adminId: string,
  reelId: string,
  status: "approved" | "rejected" | "removed",
): Promise<ReelDto> {
  await connectDb();
  const id = parseId(reelId);
  const existing = await Reel.findOne({ _id: id, status: { $ne: "uploading" } })
    .select("expiresAt kind")
    .lean();
  if (!existing) throw notFound("We couldn't find that reel.", "reel_not_found");
  // The clock starts when the reel first goes live and is never extended by a later re-approval.
  const expiresAt =
    existing.kind === "image"
      ? undefined
      : (existing.expiresAt ?? new Date(Date.now() + REEL_LIMITS.lifetimeHours * 60 * 60 * 1000));
  const reel = await Reel.findOneAndUpdate(
    { _id: id, status: { $ne: "uploading" } },
    {
      $set: {
        status,
        moderatedBy: oid(adminId),
        ...(status === "approved"
          ? { approvedAt: new Date(), reportCount: 0, ...(expiresAt ? { expiresAt } : {}) }
          : {}),
      },
    },
    { returnDocument: "after" },
  ).lean();
  if (!reel) throw notFound("We couldn't find that reel.", "reel_not_found");
  if (status === "approved") await ReelReport.deleteMany({ reelId: id });
  return (await toDtos([reel], adminId))[0] as ReelDto;
}

export async function listCommentsForModeration(
  adminId: string,
  reelId: string,
): Promise<ReelCommentDto[]> {
  await connectDb();
  const id = parseId(reelId);
  const rows = await ReelComment.find({ reelId: id }).sort({ _id: -1 }).limit(100).lean();
  return toCommentDtos(rows, adminId);
}

export async function removeCommentAsAdmin(reelId: string, commentId: string): Promise<void> {
  await connectDb();
  const comment = await ReelComment.findOne({
    _id: parseId(commentId),
    reelId: parseId(reelId),
  }).lean();
  if (!comment) throw notFound("We couldn't find that comment.", "comment_not_found");
  await removeCommentRecord(comment);
}

// ---- Housekeeping ----

/** Removes reels completely: files first, then every record that points at them. */
async function purgeReels(reels: { _id: Types.ObjectId; storagePath: string }[]): Promise<void> {
  if (reels.length === 0) return;
  const ids = reels.map((reel) => reel._id);
  await removeObjects(reels.map((reel) => reel.storagePath));
  await Promise.all([
    ReelLike.deleteMany({ reelId: { $in: ids } }),
    ReelComment.deleteMany({ reelId: { $in: ids } }),
    ReelReport.deleteMany({ reelId: { $in: ids } }),
  ]);
  await Reel.deleteMany({ _id: { $in: ids } });
}

const SWEEP_BATCH = 200;
/** Reels that never went live (waiting, declined, removed) are cleared after this long. */
const UNPUBLISHED_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Housekeeping, run by the cron: uploads never completed, reels whose 24 hours are over, and unpublished
 * reels that have sat for a week. Expired reels are already invisible the moment they expire (reads check the
 * time), so a late sweep only delays freeing storage.
 */
export async function sweepReels(): Promise<number> {
  if (!reelsConfigured()) return 0;
  await connectDb();
  const now = Date.now();
  const stale = await Reel.find({
    $or: [
      { status: "uploading", createdAt: { $lt: new Date(now - ABANDONED_AFTER_MS) } },
      { expiresAt: { $lt: new Date(now) } },
      {
        status: { $in: ["pending", "rejected", "removed"] },
        expiresAt: { $exists: false },
        createdAt: { $lt: new Date(now - UNPUBLISHED_KEEP_MS) },
      },
    ],
  })
    .select("storagePath")
    .limit(SWEEP_BATCH)
    .lean();
  await purgeReels(stale);
  return stale.length;
}

/** Everything a person published or did on reels leaves with their account; other reels' counters are corrected. */
export async function eraseUserReels(userId: string): Promise<void> {
  await connectDb();
  const id = oid(userId);
  const [mine, likes, comments] = await Promise.all([
    Reel.find({ userId: id }).select("storagePath").lean(),
    ReelLike.find({ userId: id }).select("reelId").lean(),
    ReelComment.find({ userId: id }).select("reelId").lean(),
  ]);
  const ownIds = mine.map((reel) => reel._id);
  await Promise.all([
    ReelLike.deleteMany({ $or: [{ userId: id }, { reelId: { $in: ownIds } }] }),
    ReelComment.deleteMany({ $or: [{ userId: id }, { reelId: { $in: ownIds } }] }),
    ReelReport.deleteMany({ $or: [{ userId: id }, { reelId: { $in: ownIds } }] }),
    Reel.deleteMany({ userId: id }),
  ]);
  const bump = (rows: { reelId: Types.ObjectId }[], field: "likeCount" | "commentCount") => {
    const per = new Map<string, number>();
    for (const row of rows) per.set(String(row.reelId), (per.get(String(row.reelId)) ?? 0) + 1);
    return [...per].map(([reelId, n]) => ({
      updateOne: {
        filter: { _id: oid(reelId), [field]: { $gte: n } },
        update: { $inc: { [field]: -n } },
      },
    }));
  };
  const operations = [...bump(likes, "likeCount"), ...bump(comments, "commentCount")];
  if (operations.length > 0) await Reel.bulkWrite(operations);
  await removeObjects(mine.map((reel) => reel.storagePath));
  await eraseSocial(userId);
}
