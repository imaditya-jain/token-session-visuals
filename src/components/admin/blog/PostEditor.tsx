"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import MediaPicker from "@/components/admin/blog/MediaPicker";
import TemplatePicker from "@/components/admin/blog/TemplatePicker";
import PageHeader from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { DEFAULT_BLOG_TEMPLATE, type BlogTemplateId } from "@/lib/blog-templates";
import { flattenCategories } from "@/lib/blog-tree";
import type { CategoryView, FeaturedImage, MediaView, PostDetail, TagView } from "@/lib/blog-types";
import { fromLocalInput, toLocalInput } from "@/lib/datetime-local";
import { EMPTY_DOC, type RichDoc } from "@/lib/rich-text";
import { slugify } from "@/lib/slug";
import { useAppSelector } from "@/store/hooks";
import Skeleton from "@/components/admin/Skeleton";

// The editor (ProseMirror) is only ever needed here, so it stays out of every other bundle.
const RichTextEditor = dynamic(() => import("@/components/admin/blog/RichTextEditor"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="min-h-[24rem] rounded-lg border border-input p-4 text-sm text-muted-foreground"
    >
      Loading editor…
    </div>
  ),
});

type Target = "draft" | "published" | "scheduled";

type Form = {
  title: string;
  slug: string;
  excerpt: string;
  content: RichDoc;
  featured: FeaturedImage | null;
  categoryIds: string[];
  tags: string[];
  template: BlogTemplateId;
  seoTitle: string;
  seoDescription: string;
  scheduleAt: string;
};

const blank = (): Form => ({
  title: "",
  slug: "",
  excerpt: "",
  content: EMPTY_DOC,
  featured: null,
  categoryIds: [],
  tags: [],
  template: DEFAULT_BLOG_TEMPLATE,
  seoTitle: "",
  seoDescription: "",
  scheduleAt: "",
});

const fromPost = (post: PostDetail): Form => ({
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt,
  content: post.content,
  featured: post.featuredImage,
  categoryIds: post.categoryIds,
  tags: post.tags,
  template: post.template,
  seoTitle: post.seoTitle,
  seoDescription: post.seoDescription,
  scheduleAt: post.status === "scheduled" ? toLocalInput(post.publishedAt) : "",
});

const input =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";

const message = (error: unknown): string => {
  if (error instanceof ApiError) {
    const fields = error.fields?.map((f) => f.message).filter(Boolean);
    return fields?.length ? fields.join(" ") : error.message;
  }
  return "Network problem. Check your connection and try again.";
};

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-border/60">
      <h2 className="mb-3 font-display text-lg text-forest">{title}</h2>
      {children}
    </section>
  );
}

function Editor({
  initial,
  postId: initialId,
}: {
  initial: PostDetail | null;
  postId: string | null;
}) {
  const router = useRouter();
  const permissions = useAppSelector((state) => state.admin.access?.permissions ?? []);
  const canPublish = permissions.includes("blog:publish");
  const canDelete = permissions.includes("blog:delete");
  const canManageCategories = permissions.includes("categories:manage");

  const categories = useApiResource<{ categories: CategoryView[] }>("/api/admin/categories");
  const knownTags = useApiResource<{ tags: TagView[] }>("/api/admin/tags");

  const [postId, setPostId] = useState(initialId);
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [publishedAt, setPublishedAt] = useState(initial?.publishedAt ?? null);
  const [slugValue, setSlugValue] = useState(initial?.slug ?? "");
  const [form, setForm] = useState<Form>(() => (initial ? fromPost(initial) : blank()));
  const [saved, setSaved] = useState(() => JSON.stringify(initial ? fromPost(initial) : blank()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const dirty = JSON.stringify(form) !== saved;
  const live = status === "published" || status === "scheduled";
  const readOnly = !canPublish && live;

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const autoSlug = useMemo(() => slugify(form.title), [form.title]);
  const shownSlug = form.slug.trim() || slugValue || autoSlug;

  const save = async (target: Target) => {
    setError(null);
    setNotice(null);
    let scheduledAt: string | null = null;
    if (target === "scheduled") {
      scheduledAt = fromLocalInput(form.scheduleAt);
      if (!scheduledAt || new Date(scheduledAt) <= new Date()) {
        return setError("Choose a date and time in the future to schedule this post.");
      }
    }
    if (!form.title.trim()) return setError("Give the post a title.");

    const body = {
      title: form.title,
      ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
      excerpt: form.excerpt,
      content: form.content,
      featuredImage: form.featured,
      categoryIds: form.categoryIds,
      tags: form.tags,
      template: form.template,
      seoTitle: form.seoTitle,
      seoDescription: form.seoDescription,
      status: target,
      scheduledAt,
    };
    setBusy(true);
    try {
      const { post } = await apiFetch<{ post: PostDetail }>(
        postId ? `/api/admin/posts/${postId}` : "/api/admin/posts",
        { method: postId ? "PUT" : "POST", json: body },
      );
      const next = fromPost(post);
      setForm(next);
      setSaved(JSON.stringify(next));
      setStatus(post.status);
      setPublishedAt(post.publishedAt);
      setSlugValue(post.slug);
      if (!postId) {
        setPostId(post.id);
        // The new post now has an address: keep editing in place instead of reloading.
        window.history.replaceState(null, "", `/admin/posts/${post.id}`);
      }
      setNotice(
        target === "published"
          ? "Post published."
          : target === "scheduled"
            ? "Post scheduled."
            : "Draft saved.",
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const trash = async () => {
    if (!postId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/admin/posts/bulk", {
        method: "POST",
        json: { ids: [postId], action: "trash" },
      });
      setSaved(JSON.stringify(form));
      router.push("/admin/posts");
    } catch (caught) {
      setError(message(caught));
      setBusy(false);
    }
  };

  const addTags = (raw: string) => {
    const next = [...form.tags];
    for (const piece of raw.split(",")) {
      const name = piece.trim().replace(/\s+/g, " ");
      if (name && !next.some((t) => t.toLowerCase() === name.toLowerCase()))
        next.push(name.slice(0, 60));
    }
    set("tags", next.slice(0, 20));
    setTagInput("");
  };
  const onTagKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTags(tagInput);
    } else if (event.key === "Backspace" && !tagInput && form.tags.length) {
      set("tags", form.tags.slice(0, -1));
    }
  };

  const createCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    setError(null);
    try {
      const { category } = await apiFetch<{ category: CategoryView }>("/api/admin/categories", {
        method: "POST",
        json: { name },
      });
      set("categoryIds", [...form.categoryIds, category.id]);
      setNewCategory("");
      categories.retry();
    } catch (caught) {
      setError(message(caught));
    }
  };

  const pickImage = (media: MediaView) =>
    set("featured", {
      url: media.url,
      alt: media.alt,
      ...(media.width && media.height ? { width: media.width, height: media.height } : {}),
    });

  const title = postId ? "Edit post" : "New post";

  return (
    <>
      <PageHeader
        title={title}
        lead={
          readOnly
            ? "This post is live. Ask someone with publishing rights to change it."
            : undefined
        }
        action={
          <Button asChild variant="outline" className="h-11">
            <Link href="/admin/posts">All posts</Link>
          </Button>
        }
      />

      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="mb-5 rounded-md border border-sage/50 bg-sage-light/50 px-4 py-3 text-sm text-forest"
        >
          {notice}
        </p>
      ) : null}

      <fieldset disabled={readOnly || busy} className="min-w-0 border-0 p-0">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-6">
            <div>
              <label htmlFor="post-title" className="mb-1.5 block text-sm font-medium">
                Title
              </label>
              <input
                id="post-title"
                value={form.title}
                maxLength={200}
                onChange={(event) => set("title", event.target.value)}
                className={`${input} h-14 font-display text-2xl`}
              />
              <div className="mt-3">
                <label htmlFor="post-slug" className="mb-1.5 block text-sm font-medium">
                  Slug
                </label>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 font-mono text-sm text-muted-foreground">/blog/</span>
                  <input
                    id="post-slug"
                    value={form.slug}
                    maxLength={80}
                    placeholder={autoSlug || "created from the title"}
                    onChange={(event) => set("slug", event.target.value.toLowerCase())}
                    className={`${input} font-mono`}
                  />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {slugValue && form.slug.trim() && form.slug.trim() !== slugValue
                    ? "The old address will keep working and redirect to the new one."
                    : "Lowercase letters, digits and hyphens. Left empty, it is made from the title."}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium" id="content-label">
                Content
              </p>
              <RichTextEditor initial={form.content} onChange={(doc) => set("content", doc)} />
            </div>

            <Box title="Excerpt">
              <label htmlFor="post-excerpt" className="sr-only">
                Excerpt
              </label>
              <textarea
                id="post-excerpt"
                rows={3}
                maxLength={400}
                value={form.excerpt}
                onChange={(event) => set("excerpt", event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                A short summary for listings and sharing. Left empty, the opening of the post is
                used. {form.excerpt.length}/400
              </p>
            </Box>

            <Box title="Search appearance">
              <div className="space-y-4">
                <div>
                  <label htmlFor="seo-title" className="mb-1.5 block text-sm font-medium">
                    SEO title
                  </label>
                  <input
                    id="seo-title"
                    value={form.seoTitle}
                    maxLength={120}
                    onChange={(event) => set("seoTitle", event.target.value)}
                    className={input}
                  />
                </div>
                <div>
                  <label htmlFor="seo-description" className="mb-1.5 block text-sm font-medium">
                    Meta description
                  </label>
                  <textarea
                    id="seo-description"
                    rows={2}
                    maxLength={320}
                    value={form.seoDescription}
                    onChange={(event) => set("seoDescription", event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {form.seoDescription.length}/320
                  </p>
                </div>
                <div
                  className="rounded-lg bg-background p-3 ring-1 ring-border"
                  aria-label="Search result preview"
                >
                  <p className="truncate text-base text-forest">
                    {form.seoTitle || form.title || "Post title"} — Fernwood
                  </p>
                  <p className="truncate text-xs text-moss">/blog/{shownSlug || "…"}</p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {form.seoDescription || form.excerpt || "The opening of the post appears here."}
                  </p>
                </div>
              </div>
            </Box>
          </div>

          <aside aria-label="Post settings" className="min-w-0 space-y-6">
            <Box title="Publish">
              <p className="mb-4 text-sm text-muted-foreground">
                {status === "published"
                  ? `Published${publishedAt ? ` on ${new Date(publishedAt).toLocaleString()}` : ""}`
                  : status === "scheduled"
                    ? `Scheduled for ${publishedAt ? new Date(publishedAt).toLocaleString() : ""}`
                    : postId
                      ? "Draft"
                      : "Not saved yet"}
                {dirty ? " · unsaved changes" : ""}
              </p>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  disabled={busy}
                  onClick={() => void save("draft")}
                >
                  {status === "draft" || !postId ? "Save draft" : "Switch to draft"}
                </Button>
                {canPublish ? (
                  <>
                    <Button
                      className="h-11 w-full"
                      disabled={busy}
                      onClick={() => void save("published")}
                    >
                      {status === "published" ? "Update" : "Publish now"}
                    </Button>
                    <div className="rounded-lg bg-background p-3 ring-1 ring-border">
                      <label htmlFor="schedule-at" className="mb-1.5 block text-sm font-medium">
                        Publish later
                      </label>
                      <input
                        id="schedule-at"
                        type="datetime-local"
                        value={form.scheduleAt}
                        onChange={(event) => set("scheduleAt", event.target.value)}
                        className={input}
                      />
                      <Button
                        variant="outline"
                        className="mt-2 h-11 w-full"
                        disabled={busy || !form.scheduleAt}
                        onClick={() => void save("scheduled")}
                      >
                        {status === "scheduled" ? "Reschedule" : "Schedule"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    You can save drafts. Publishing needs publishing rights.
                  </p>
                )}
                {status === "published" && postId ? (
                  <Button asChild variant="outline" className="h-11 w-full">
                    <Link href={`/blog/${slugValue}`} target="_blank" rel="noopener noreferrer">
                      View post
                    </Link>
                  </Button>
                ) : null}
                {postId && canDelete ? (
                  <button
                    type="button"
                    onClick={() => void trash()}
                    disabled={busy}
                    className="min-h-11 w-full text-sm font-medium text-destructive underline-offset-4 hover:underline"
                  >
                    Move to trash
                  </button>
                ) : null}
              </div>
            </Box>

            <Box title="Page template">
              <TemplatePicker value={form.template} onChange={(next) => set("template", next)} />
            </Box>

            <Box title="Categories">
              {categories.status === "ready" ? (
                <fieldset>
                  <legend className="sr-only">Categories</legend>
                  <div className="max-h-56 space-y-0.5 overflow-y-auto">
                    {flattenCategories(categories.data.categories).map(({ category, depth }) => (
                      <label
                        key={category.id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-muted"
                        style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--forest)]"
                          checked={form.categoryIds.includes(category.id)}
                          onChange={(event) =>
                            set(
                              "categoryIds",
                              event.target.checked
                                ? [...form.categoryIds, category.id]
                                : form.categoryIds.filter((id) => id !== category.id),
                            )
                          }
                        />
                        {category.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : categories.status === "error" ? (
                <p role="alert" className="text-sm text-destructive">
                  Couldn&apos;t load categories.
                </p>
              ) : (
                <Skeleton variant="form" />
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                With none ticked, the post goes in Uncategorized.
              </p>
              {canManageCategories ? (
                <div className="mt-3 flex gap-2">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="new-category" className="sr-only">
                      New category name
                    </label>
                    <input
                      id="new-category"
                      value={newCategory}
                      placeholder="New category"
                      onChange={(event) => setNewCategory(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void createCategory();
                        }
                      }}
                      className={input}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() => void createCategory()}
                  >
                    Add
                  </Button>
                </div>
              ) : null}
            </Box>

            <Box title="Tags">
              <ul className="mb-2 flex flex-wrap gap-2" aria-label="Chosen tags">
                {form.tags.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "tags",
                          form.tags.filter((t) => t !== tag),
                        )
                      }
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-muted px-3 text-sm text-forest hover:bg-sage-light"
                    >
                      #{tag}
                      <span aria-hidden>×</span>
                      <span className="sr-only">Remove tag {tag}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <label htmlFor="tag-input" className="sr-only">
                Add tags
              </label>
              <input
                id="tag-input"
                value={tagInput}
                list="known-tags"
                placeholder="Add a tag, then press Enter"
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={onTagKey}
                onBlur={() => tagInput.trim() && addTags(tagInput)}
                className={input}
              />
              <datalist id="known-tags">
                {knownTags.status === "ready"
                  ? knownTags.data.tags.map((tag) => <option key={tag.id} value={tag.name} />)
                  : null}
              </datalist>
            </Box>

            <Box title="Featured image">
              {form.featured ? (
                <div className="space-y-3">
                  <Image
                    src={form.featured.url}
                    alt={form.featured.alt || "Featured image preview"}
                    width={form.featured.width ?? 600}
                    height={form.featured.height ?? 340}
                    sizes="336px"
                    className="aspect-[16/9] w-full rounded-lg bg-sand object-cover"
                  />
                  <div>
                    <label htmlFor="featured-alt" className="mb-1.5 block text-sm font-medium">
                      Alternative text
                    </label>
                    <input
                      id="featured-alt"
                      value={form.featured.alt}
                      maxLength={300}
                      onChange={(event) =>
                        set("featured", {
                          ...(form.featured as FeaturedImage),
                          alt: event.target.value,
                        })
                      }
                      className={input}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 flex-1"
                      onClick={() => setPicking(true)}
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 flex-1"
                      onClick={() => set("featured", null)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() => setPicking(true)}
                >
                  Set featured image
                </Button>
              )}
              <MediaPicker open={picking} onOpenChange={setPicking} onPick={pickImage} />
            </Box>
          </aside>
        </div>
      </fieldset>
    </>
  );
}

/** Loads the post (when editing) and mounts the form once the data is here, so the form starts from real values. */
export default function PostEditor({ id }: { id?: string }) {
  const post = useApiResource<{ post: PostDetail }>(id ? `/api/admin/posts/${id}` : null);
  if (!id) return <Editor key="new" initial={null} postId={null} />;
  if (post.status === "loading") {
    return (
      <>
        <PageHeader title="Edit post" />
        <Skeleton variant="form" />
      </>
    );
  }
  if (post.status === "error") {
    return (
      <>
        <PageHeader title="Edit post" />
        <div role="alert" className="text-sm text-destructive">
          {post.httpStatus === 404 ? "This post doesn't exist." : post.message}{" "}
          {post.httpStatus === 404 ? (
            <Link href="/admin/posts" className="underline">
              Back to posts
            </Link>
          ) : (
            <button className="underline" onClick={post.retry}>
              Try again
            </button>
          )}
        </div>
      </>
    );
  }
  return <Editor key={post.data.post.id} initial={post.data.post} postId={post.data.post.id} />;
}
