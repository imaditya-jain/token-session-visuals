import { z } from "zod";

/** Hard limits of the Reels feature. The app and the server read the same numbers. */
export const REEL_LIMITS = {
  imageBytes: 2 * 1024 * 1024,
  videoBytes: 5 * 1024 * 1024,
  videoMaxMs: 30_000,
  captionChars: 300,
  commentChars: 300,
  productLinks: 4,
  perUserDaily: 10,
} as const;

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
    durationMs: z.number().int().positive().max(REEL_LIMITS.videoMaxMs).optional(),
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
    if (value.kind === "video" && value.durationMs === undefined) {
      ctx.addIssue({ code: "custom", path: ["durationMs"], message: "Videos need a length." });
    }
    if (value.kind === "image" && value.durationMs !== undefined) {
      ctx.addIssue({ code: "custom", path: ["durationMs"], message: "Pictures have no length." });
    }
  });
export type CreateReelInput = z.infer<typeof createReelSchema>;

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
  mediaUrl: string;
  durationMs: number | null;
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
};

export type ReelCommentDto = {
  id: string;
  text: string;
  author: string;
  mine: boolean;
  createdAt: string;
};
