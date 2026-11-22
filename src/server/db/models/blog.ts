import "server-only";

import { Schema, type Types } from "mongoose";

import type { BlogTemplateId } from "@/lib/blog-templates";
import type { FeaturedImage, PostStatus } from "@/lib/blog-types";
import type { Heading, RichDoc } from "@/lib/rich-text";
import { defineModel } from "@/server/db/define-model";

export type CategoryRecord = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  parentId?: Types.ObjectId | undefined;
  /** "Uncategorized": every post has at least one category, so it falls back to this one. Can't be deleted. */
  isDefault: boolean;
  createdAt: Date;
};

const categorySchema = new Schema<CategoryRecord>({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  slug: { type: String, required: true, unique: true, maxlength: 80 },
  description: { type: String, default: "", trim: true, maxlength: 500 },
  parentId: { type: Schema.Types.ObjectId },
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, required: true, default: () => new Date() },
});
categorySchema.index({ parentId: 1 });
// At most one default category, enforced by the database.
categorySchema.index(
  { isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } },
);

export const Category = defineModel<CategoryRecord>("Category", categorySchema);

export type TagRecord = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  createdAt: Date;
};

const tagSchema = new Schema<TagRecord>({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  slug: { type: String, required: true, unique: true, maxlength: 80 },
  createdAt: { type: Date, required: true, default: () => new Date() },
});

export const Tag = defineModel<TagRecord>("Tag", tagSchema);

export type PostRecord = {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  /** Earlier slugs of this post: old links keep working through a permanent redirect. */
  previousSlugs: string[];
  excerpt: string;
  /** The editable source of truth (validated against the allow-list). */
  content: RichDoc;
  /** Rendered once on save from `content`, so public pages never render on the request path. */
  contentHtml: string;
  headings: Heading[];
  searchText: string;
  /** Auto-generated opening of the text, used when the author wrote no excerpt (kept small so list pages stay light). */
  summary: string;
  readingMinutes: number;
  featuredImage?: FeaturedImage | undefined;
  status: PostStatus;
  /** Publication time; for a scheduled post, the moment it goes live. */
  publishedAt?: Date | undefined;
  authorId: Types.ObjectId;
  categoryIds: Types.ObjectId[];
  tagIds: Types.ObjectId[];
  template: BlogTemplateId;
  seoTitle: string;
  seoDescription: string;
  trashedAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

const postSchema = new Schema<PostRecord>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, maxlength: 80 },
    previousSlugs: { type: [String], default: [] },
    excerpt: { type: String, default: "", trim: true, maxlength: 400 },
    content: { type: Schema.Types.Mixed, required: true },
    contentHtml: { type: String, required: true },
    headings: { type: Schema.Types.Mixed, default: [] },
    searchText: { type: String, default: "", maxlength: 60_000 },
    summary: { type: String, default: "", maxlength: 400 },
    readingMinutes: { type: Number, required: true, default: 1 },
    featuredImage: {
      type: new Schema(
        {
          url: { type: String, required: true },
          alt: { type: String, default: "", maxlength: 300 },
          width: { type: Number },
          height: { type: Number },
        },
        { _id: false },
      ),
    },
    status: {
      type: String,
      enum: ["draft", "scheduled", "published", "trash"],
      default: "draft",
      required: true,
    },
    publishedAt: { type: Date },
    authorId: { type: Schema.Types.ObjectId, required: true },
    categoryIds: { type: [Schema.Types.ObjectId], default: [] },
    tagIds: { type: [Schema.Types.ObjectId], default: [] },
    template: {
      type: String,
      enum: ["classic", "magazine", "editorial", "visual", "guide"],
      default: "classic",
      required: true,
    },
    seoTitle: { type: String, default: "", trim: true, maxlength: 120 },
    seoDescription: { type: String, default: "", trim: true, maxlength: 320 },
    trashedAt: { type: Date },
  },
  { timestamps: true },
);

postSchema.index({ previousSlugs: 1 });
postSchema.index({ status: 1, publishedAt: -1 });
postSchema.index({ categoryIds: 1, status: 1, publishedAt: -1 });
postSchema.index({ tagIds: 1, status: 1, publishedAt: -1 });
postSchema.index({ title: "text", searchText: "text" });

export const Post = defineModel<PostRecord>("Post", postSchema);

export type MediaAssetRecord = {
  _id: Types.ObjectId;
  /** Shopify `File` GID: the file itself lives in Shopify Files. */
  gid: string;
  url: string;
  alt: string;
  filename: string;
  mimeType: string;
  bytes: number;
  width?: number | undefined;
  height?: number | undefined;
  createdBy: Types.ObjectId;
  createdAt: Date;
};

const mediaAssetSchema = new Schema<MediaAssetRecord>({
  gid: { type: String, required: true, unique: true },
  url: { type: String, required: true },
  alt: { type: String, default: "", maxlength: 300 },
  filename: { type: String, required: true, maxlength: 200 },
  mimeType: { type: String, required: true },
  bytes: { type: Number, required: true },
  width: { type: Number },
  height: { type: Number },
  createdBy: { type: Schema.Types.ObjectId, required: true },
  createdAt: { type: Date, required: true, default: () => new Date() },
});
mediaAssetSchema.index({ createdAt: -1 });

export const MediaAsset = defineModel<MediaAssetRecord>("MediaAsset", mediaAssetSchema);
