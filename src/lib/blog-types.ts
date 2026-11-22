import type { BlogTemplateId } from "@/lib/blog-templates";
import type { Heading, RichDoc } from "@/lib/rich-text";

export type PostStatus = "draft" | "scheduled" | "published" | "trash";

export type FeaturedImage = {
  url: string;
  alt: string;
  width?: number | undefined;
  height?: number | undefined;
};

export type TermView = { id: string; name: string; slug: string };

export type CategoryView = TermView & {
  description: string;
  parentId: string | null;
  isDefault: boolean;
  /** Published posts only. */
  count: number;
  /** All posts that carry it, whatever their status (what blocks nothing but explains deletion). */
  totalCount: number;
};

export type TagView = TermView & { count: number };

/** A row in the admin list. */
export type PostListItem = {
  id: string;
  title: string;
  slug: string;
  status: PostStatus;
  publishedAt: string | null;
  updatedAt: string;
  authorName: string;
  categories: TermView[];
  tags: TermView[];
  template: BlogTemplateId;
};

export type PostCounts = Record<PostStatus, number> & { all: number };

/** Everything the editor needs. */
export type PostDetail = {
  id: string;
  title: string;
  slug: string;
  status: PostStatus;
  excerpt: string;
  content: RichDoc;
  featuredImage: FeaturedImage | null;
  categoryIds: string[];
  tags: string[];
  template: BlogTemplateId;
  seoTitle: string;
  seoDescription: string;
  publishedAt: string | null;
  updatedAt: string;
  authorName: string;
};

/** A published post as the public site renders it. */
export type PublicPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  html: string;
  headings: Heading[];
  featuredImage: FeaturedImage | null;
  publishedAt: string;
  updatedAt: string;
  authorName: string;
  categories: TermView[];
  tags: TermView[];
  template: BlogTemplateId;
  seoTitle: string;
  seoDescription: string;
  readingMinutes: number;
};

export type PublicPostCard = Pick<
  PublicPost,
  | "id"
  | "title"
  | "slug"
  | "excerpt"
  | "featuredImage"
  | "publishedAt"
  | "authorName"
  | "readingMinutes"
  | "categories"
>;

export type MediaView = {
  id: string;
  url: string;
  alt: string;
  filename: string;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
  createdAt: string;
};
