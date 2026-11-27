import { z } from "zod";

/** Hard limits of the Reels feature. The app and the server read the same numbers. */
export const REEL_LIMITS = {
  imageBytes: 20 * 1024 * 1024,
  videoBytes: 20 * 1024 * 1024,
  videoMaxMs: 30_000,
  captionChars: 300,
  commentChars: 300,
  productLinks: 4,
  perUserDaily: 10,
  /** A video reel disappears this long after it goes live, like a story. Photo posts stay. */
  lifetimeHours: 24,
} as const;

/**
 * Shapes allowed for pictures and videos, as width / height: from 4:9 (tall) to 16:9 (wide). 1:1, 4:5, 7:11, 9:16
 * and 16:9 all fit. Wider or taller files are refused so nothing is stretched or cropped to an odd sliver.
 */
export const REEL_ASPECT = { min: 0.44, max: 1.8 } as const;

/** Photos may be any shape (a panorama, a tall screenshot); only absurd slivers are refused. */
export const PHOTO_ASPECT = { min: 0.2, max: 5 } as const;

export const REEL_TOPICS = ["gardening", "home-planting", "landscaping"] as const;
export type ReelTopic = (typeof REEL_TOPICS)[number];

export const REEL_TOPIC_LABELS: Record<ReelTopic, string> = {
  gardening: "Gardening",
  "home-planting": "Home planting",
  landscaping: "Landscaping",
};

export const REEL_MEDIA_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/quicktime"],
} as const;

export const REEL_STATUSES = ["uploading", "pending", "approved", "rejected", "removed"] as const;
export type ReelStatus = (typeof REEL_STATUSES)[number];

/** Same shape as catalogue handles. */
const HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Plain text only: control characters (other than tab and line breaks) are rejected, not stripped. */
const noControls = (value: string) =>
  [...value].every((char) => {
    const code = char.charCodeAt(0);
    return code > 31 || code === 9 || code === 10 || code === 13 ? code !== 127 : false;
  });

const text = (max: number) =>
  z.string().trim().max(max).refine(noControls, "Contains invalid characters");

export const createReelSchema = z
  .object({
    kind: z.enum(["image", "video"]),
    contentType: z.string().max(40),
    sizeBytes: z.number().int().positive(),
    // Phones report fractions of a millisecond; the length is stored as whole milliseconds.
    durationMs: z
      .number()
      .positive()
      .max(REEL_LIMITS.videoMaxMs)
      .transform((value) => Math.max(1, Math.round(value)))
      .optional(),
    aspectRatio: z.number().min(PHOTO_ASPECT.min).max(PHOTO_ASPECT.max),
    caption: text(REEL_LIMITS.captionChars).default(""),
    topic: z.enum(REEL_TOPICS),
    productHandles: z
      .array(z.string().max(120).regex(HANDLE))
      .max(REEL_LIMITS.productLinks)
      .default([])
      .transform((handles) => [...new Set(handles)]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const allowed: readonly string[] = REEL_MEDIA_TYPES[value.kind];
    if (!allowed.includes(value.contentType)) {
      ctx.addIssue({
        code: "custom",
        path: ["contentType"],
        message: "This file type is not allowed.",
      });
    }
    const limit = value.kind === "image" ? REEL_LIMITS.imageBytes : REEL_LIMITS.videoBytes;
    if (value.sizeBytes > limit) {
      ctx.addIssue({
        code: "custom",
        path: ["sizeBytes"],
        message: `${value.kind === "image" ? "Pictures" : "Videos"} can be up to ${limit / 1024 / 1024} MB.`,
      });
    }
    // Only videos are held to the 4:9 to 16:9 range (they fill a vertical player); photos keep their own shape.
    if (
      value.kind === "video" &&
      (value.aspectRatio < REEL_ASPECT.min || value.aspectRatio > REEL_ASPECT.max)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["aspectRatio"],
        message: "Videos should be between 4:9 (tall) and 16:9 (wide).",
      });
    }
    if (value.kind === "video" && value.durationMs === undefined) {
      ctx.addIssue({ code: "custom", path: ["durationMs"], message: "Videos need a length." });
    }
    if (value.kind === "image" && value.durationMs !== undefined) {
      ctx.addIssue({ code: "custom", path: ["durationMs"], message: "Pictures have no length." });
    }
  });
export type CreateReelInput = z.infer<typeof createReelSchema>;

/** What the author may change after posting. The picture or video itself is fixed, as on Instagram. */
export const updateReelSchema = z
  .object({
    caption: text(REEL_LIMITS.captionChars).optional(),
    topic: z.enum(REEL_TOPICS).optional(),
    productHandles: z
      .array(z.string().max(120).regex(HANDLE))
      .max(REEL_LIMITS.productLinks)
      .transform((handles) => [...new Set(handles)])
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");
export type UpdateReelInput = z.infer<typeof updateReelSchema>;

export const commentSchema = z.object({ text: text(REEL_LIMITS.commentChars).min(1) }).strict();

export const reportSchema = z
  .object({
    reason: z.enum(["spam", "unsafe", "off-topic", "other"]),
    commentId: z
      .string()
      .regex(/^[a-f0-9]{24}$/)
      .optional(),
  })
  .strict();

export const moderateReelSchema = z
  .object({ status: z.enum(["approved", "rejected", "removed"]) })
  .strict();

export type ReelProductDto = {
  handle: string;
  name: string;
  price: number;
  image: string;
  inStock: boolean;
};

export type ReelDto = {
  id: string;
  kind: "image" | "video";
  /** Photos are permanent "posts"; videos are "reels" that disappear after 24 hours. */
  format: "post" | "reel";
  /** Opaque public handle of the author (never the account id). */
  authorKey: string;
  /** The viewer's relationship to this author ("none" for guests). */
  followStatus: FollowStatus;
  mediaUrl: string;
  durationMs: number | null;
  /** Width divided by height, so the picture is shown in its own shape. */
  aspectRatio: number;
  caption: string;
  topic: ReelTopic;
  author: string;
  mine: boolean;
  likes: number;
  comments: number;
  liked: boolean;
  products: ReelProductDto[];
  status: ReelStatus;
  createdAt: string;
  /** When it will disappear; absent until it goes live. */
  expiresAt: string | null;
};

export type ReelCommentDto = {
  id: string;
  text: string;
  author: string;
  mine: boolean;
  createdAt: string;
};

export const privacySchema = z.object({ isPrivate: z.boolean() }).strict();

export type FollowStatus = "none" | "requested" | "following" | "self";

export type AuthorProfileDto = {
  key: string;
  name: string;
  isPrivate: boolean;
  followers: number;
  following: number;
  /** Live posts and reels this person can see (0 when the account is private and not followed). */
  items: number;
  followStatus: FollowStatus;
  canView: boolean;
};

export type FollowRequestDto = { key: string; name: string; createdAt: string };
