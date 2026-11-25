"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import { useAdminMutation } from "@/components/admin/useAdminApi";
import PageHeader from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { flattenCategories } from "@/lib/blog-tree";
import { BLOG_TEMPLATES } from "@/lib/blog-templates";
import type { CategoryView, PostCounts, PostListItem, PostStatus } from "@/lib/blog-types";
import { useAppSelector } from "@/store/hooks";
import Skeleton from "@/components/admin/Skeleton";

const PER_PAGE = 20;
type Bulk = "trash" | "restore" | "delete" | "publish" | "draft";
type Filter = "all" | PostStatus;

const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "published", label: "Published" },
  { key: "scheduled", label: "Scheduled" },
  { key: "draft", label: "Drafts" },
  { key: "trash", label: "Trash" },
];

const when = (iso: string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

function statusLine(post: PostListItem): string {
  switch (post.status) {
    case "published":
      return `Published ${post.publishedAt ? when(post.publishedAt) : ""}`;
    case "scheduled":
      return `Scheduled for ${post.publishedAt ? when(post.publishedAt) : ""}`;
    case "draft":
      return `Draft · modified ${when(post.updatedAt)}`;
    case "trash":
      return `In trash · modified ${when(post.updatedAt)}`;
  }
}

export default function PostsPanel() {
  const permissions = useAppSelector((state) => state.admin.access?.permissions ?? []);
  const canWrite = permissions.includes("blog:write");
  const canPublish = permissions.includes("blog:publish");
  const canDelete = permissions.includes("blog:delete");

  const [filter, setFilter] = useState<Filter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<Bulk | "">("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const mutation = useAdminMutation();
  const [notice, setNotice] = useState<string | null>(null);

  const query = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
  if (filter !== "all") query.set("status", filter);
  if (search) query.set("search", search);
  if (categoryId) query.set("categoryId", categoryId);

  const posts = useApiResource<{ posts: PostListItem[]; total: number; counts: PostCounts }>(
    `/api/admin/posts?${query.toString()}`,
  );
  const categories = useApiResource<{ categories: CategoryView[] }>("/api/admin/categories");

  const data = posts.status === "ready" ? posts.data : null;
  const rows = data?.posts ?? [];
  const selected = rows.filter((row) => chosen.has(row.id)).map((row) => row.id);
  const pages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;

  const allowedBulk: { value: Bulk; label: string }[] = [
    ...(canPublish && filter !== "trash"
      ? [
          { value: "publish" as const, label: "Publish" },
          { value: "draft" as const, label: "Unpublish (back to draft)" },
        ]
      : []),
    ...(canDelete && filter !== "trash"
      ? [{ value: "trash" as const, label: "Move to trash" }]
      : []),
    ...(canDelete && filter === "trash"
      ? [
          { value: "restore" as const, label: "Restore" },
          { value: "delete" as const, label: "Delete permanently" },
        ]
      : []),
  ];

  const apply = async (action: Bulk, ids: string[]) => {
    setNotice(null);
    const done = await mutation.run<{ changed: number }>("/api/admin/posts/bulk", "POST", {
      ids,
      action,
    });
    if (done) {
      setNotice(`${done.changed} ${done.changed === 1 ? "post" : "posts"} updated.`);
      setChosen(new Set());
      setBulk("");
      setConfirmDelete(null);
      posts.retry();
    }
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
    setChosen(new Set());
  };

  return (
    <>
      <PageHeader
        title="Posts"
        lead="Everything you have written for the journal."
        action={
          canWrite ? (
            <Button asChild className="h-11">
              <Link href="/admin/posts/new">Add new post</Link>
            </Button>
          ) : undefined
        }
      />

      <nav
        aria-label="Post status"
        className="mb-5 flex flex-wrap gap-x-5 gap-y-1 border-b border-border"
      >
        {TABS.map((tab) => {
          const count = data?.counts[tab.key];
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => {
                setFilter(tab.key);
                setPage(1);
                setChosen(new Set());
                setBulk("");
              }}
              className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-semibold ${
                active
                  ? "border-clay text-forest"
                  : "border-transparent text-muted-foreground hover:text-forest"
              }`}
            >
              {tab.label}
              {count !== undefined ? <span className="ml-1.5 font-normal">({count})</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        {allowedBulk.length > 0 ? (
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="bulk-action" className="mb-1 block text-xs text-muted-foreground">
                Bulk actions
              </label>
              <select
                id="bulk-action"
                value={bulk}
                onChange={(event) => setBulk(event.target.value as Bulk | "")}
                className="h-11 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Choose…</option>
                {allowedBulk.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              className="h-11"
              disabled={!bulk || selected.length === 0 || mutation.pending}
              onClick={() => bulk && void apply(bulk, selected)}
            >
              Apply
            </Button>
          </div>
        ) : null}
        <div>
          <label htmlFor="post-category" className="mb-1 block text-xs text-muted-foreground">
            Category
          </label>
          <select
            id="post-category"
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setPage(1);
            }}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All categories</option>
            {categories.status === "ready"
              ? flattenCategories(categories.data.categories).map(({ category, depth }) => (
                  <option key={category.id} value={category.id}>
                    {`${"— ".repeat(depth)}${category.name}`}
                  </option>
                ))
              : null}
          </select>
        </div>
        <form onSubmit={submitSearch} role="search" className="ml-auto flex items-end gap-2">
          <div>
            <label htmlFor="post-search" className="mb-1 block text-xs text-muted-foreground">
              Search posts
            </label>
            <input
              id="post-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="h-11 w-48 rounded-md border border-input bg-background px-3 text-sm sm:w-64"
            />
          </div>
          <Button type="submit" variant="outline" className="h-11">
            Search
          </Button>
        </form>
      </div>

      {notice ? (
        <p
          role="status"
          className="mb-4 rounded-md border border-sage/50 bg-sage-light/50 px-4 py-3 text-sm text-forest"
        >
          {notice}
        </p>
      ) : null}
      {mutation.error ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {mutation.error}
        </p>
      ) : null}

      {posts.status === "loading" ? (
        <Skeleton variant="list" />
      ) : posts.status === "error" ? (
        <div role="alert" className="text-sm text-destructive">
          {posts.message}{" "}
          <button className="underline" onClick={posts.retry}>
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          {search || categoryId || filter !== "all" ? "No posts match." : "No posts yet."}
        </p>
      ) : (
        <>
          {allowedBulk.length > 0 ? (
            <label className="mb-2 flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--forest)]"
                checked={selected.length === rows.length}
                onChange={(event) =>
                  setChosen(event.target.checked ? new Set(rows.map((r) => r.id)) : new Set())
                }
              />
              Select all on this page
            </label>
          ) : null}
          <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60">
            {rows.map((post) => (
              <li key={post.id} className="flex flex-wrap items-start gap-4 px-4 py-4">
                {allowedBulk.length > 0 ? (
                  <input
                    type="checkbox"
                    aria-label={`Select ${post.title}`}
                    className="mt-1.5 h-4 w-4 accent-[var(--forest)]"
                    checked={chosen.has(post.id)}
                    onChange={(event) => {
                      const next = new Set(chosen);
                      if (event.target.checked) next.add(post.id);
                      else next.delete(post.id);
                      setChosen(next);
                    }}
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">
                    {post.status === "trash" || !canWrite ? (
                      post.title
                    ) : (
                      <Link
                        href={`/admin/posts/${post.id}`}
                        className="text-forest hover:text-clay hover:underline"
                      >
                        {post.title}
                      </Link>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {statusLine(post)} · {post.authorName} · {BLOG_TEMPLATES[post.template].name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {post.categories.map((c) => c.name).join(", ") || "—"}
                    {post.tags.length ? ` · ${post.tags.map((t) => `#${t.name}`).join(" ")}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {post.status === "published" ? (
                    <Button asChild variant="outline" className="h-11">
                      <Link href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer">
                        View<span className="sr-only"> {post.title}</span>
                      </Link>
                    </Button>
                  ) : null}
                  {post.status !== "trash" && canWrite ? (
                    <Button asChild variant="outline" className="h-11">
                      <Link href={`/admin/posts/${post.id}`}>
                        Edit<span className="sr-only"> {post.title}</span>
                      </Link>
                    </Button>
                  ) : null}
                  {canDelete && post.status !== "trash" ? (
                    <Button
                      variant="outline"
                      className="h-11"
                      disabled={mutation.pending}
                      onClick={() => void apply("trash", [post.id])}
                    >
                      Trash<span className="sr-only"> {post.title}</span>
                    </Button>
                  ) : null}
                  {canDelete && post.status === "trash" ? (
                    <>
                      <Button
                        variant="outline"
                        className="h-11"
                        disabled={mutation.pending}
                        onClick={() => void apply("restore", [post.id])}
                      >
                        Restore<span className="sr-only"> {post.title}</span>
                      </Button>
                      {confirmDelete === post.id ? (
                        <Button
                          variant="destructive"
                          className="h-11"
                          disabled={mutation.pending}
                          onClick={() => void apply("delete", [post.id])}
                        >
                          Confirm delete<span className="sr-only"> {post.title}</span>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="h-11"
                          onClick={() => setConfirmDelete(post.id)}
                        >
                          Delete permanently<span className="sr-only"> {post.title}</span>
                        </Button>
                      )}
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <nav
              aria-label="Pages of posts"
              className="mt-6 flex items-center justify-center gap-4"
            >
              <Button
                variant="outline"
                className="h-11"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button
                variant="outline"
                className="h-11"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
