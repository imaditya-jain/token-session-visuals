"use client";

import { useState, type FormEvent } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import { useAdminMutation } from "@/components/admin/useAdminApi";
import PageHeader from "@/components/admin/PageHeader";
import TextField from "@/components/auth/TextField";
import { Button } from "@/components/ui/button";
import { flattenCategories, subtreeIds } from "@/lib/blog-tree";
import type { CategoryView, TagView } from "@/lib/blog-types";
import Skeleton from "@/components/admin/Skeleton";

const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type CategoryDraft = { name: string; slug: string; description: string; parentId: string };
const emptyDraft: CategoryDraft = { name: "", slug: "", description: "", parentId: "" };

function CategoryForm({
  categories,
  initial,
  selfId,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  categories: CategoryView[];
  initial: CategoryDraft;
  selfId?: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: (draft: CategoryDraft) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const blocked = selfId ? subtreeIds(selfId, categories) : new Set<string>();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return setError("Give the category a name.");
    setError(null);
    onSubmit(draft);
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="Name"
        required
        value={draft.name}
        onChange={(event) => setDraft((d) => ({ ...d, name: event.target.value }))}
      />
      <TextField
        label="Slug"
        hint="The address part. Leave empty to create it from the name."
        value={draft.slug}
        onChange={(event) => setDraft((d) => ({ ...d, slug: event.target.value }))}
      />
      <div>
        <label htmlFor={`parent-${selfId ?? "new"}`} className="mb-1.5 block text-sm font-medium">
          Parent category
        </label>
        <select
          id={`parent-${selfId ?? "new"}`}
          className={selectClass}
          value={draft.parentId}
          onChange={(event) => setDraft((d) => ({ ...d, parentId: event.target.value }))}
        >
          <option value="">None</option>
          {flattenCategories(categories)
            .filter(({ category }) => !blocked.has(category.id))
            .map(({ category, depth }) => (
              <option key={category.id} value={category.id}>
                {`${"— ".repeat(depth)}${category.name}`}
              </option>
            ))}
        </select>
      </div>
      <TextField
        label="Description"
        value={draft.description}
        onChange={(event) => setDraft((d) => ({ ...d, description: event.target.value }))}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {error}
        </p>
      ) : null}
      <div className="flex gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} className="h-11">
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

const body = (draft: CategoryDraft) => ({
  name: draft.name,
  ...(draft.slug.trim() ? { slug: draft.slug.trim() } : {}),
  description: draft.description,
  parentId: draft.parentId || null,
});

export default function TaxonomyPanel() {
  const categories = useApiResource<{ categories: CategoryView[] }>("/api/admin/categories");
  const tags = useApiResource<{ tags: TagView[] }>("/api/admin/tags");
  const mutation = useAdminMutation();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [tagEditing, setTagEditing] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState({ name: "", slug: "" });

  if (categories.status === "loading" || tags.status === "loading") {
    return (
      <>
        <PageHeader title="Categories and tags" />
        <Skeleton variant="list" />
      </>
    );
  }
  if (categories.status === "error" || tags.status === "error") {
    const failed = categories.status === "error" ? categories : tags;
    return (
      <>
        <PageHeader title="Categories and tags" />
        <div role="alert" className="text-sm text-destructive">
          {failed.status === "error" ? failed.message : ""}{" "}
          <button
            className="underline"
            onClick={() => {
              categories.retry();
              tags.retry();
            }}
          >
            Try again
          </button>
        </div>
      </>
    );
  }

  const all = categories.data.categories;
  const reload = () => {
    categories.retry();
    tags.retry();
  };

  const run = async (path: string, method: string, payload?: unknown) => {
    if (await mutation.run(path, method, payload)) {
      reload();
      return true;
    }
    return false;
  };

  return (
    <>
      <PageHeader
        title="Categories and tags"
        lead="Categories group posts and can be nested up to three levels. Tags are free-form labels you add while writing."
      />
      {mutation.error ? (
        <p
          role="alert"
          className="mb-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {mutation.error}
        </p>
      ) : null}

      <section aria-labelledby="cats-heading" className="mb-14">
        <h2 id="cats-heading" className="mb-4 font-display text-2xl text-forest">
          Categories
        </h2>
        <div className="mb-6 rounded-xl bg-card p-5 ring-1 ring-border/60">
          <h3 className="mb-3 font-medium text-foreground">Add a category</h3>
          <CategoryForm
            key={all.length}
            categories={all}
            initial={emptyDraft}
            submitLabel="Add category"
            pending={mutation.pending}
            onSubmit={(draft) => void run("/api/admin/categories", "POST", body(draft))}
          />
        </div>
        <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60">
          {flattenCategories(all).map(({ category, depth }) => (
            <li
              key={category.id}
              className="px-4 py-3"
              style={{ paddingLeft: `${1 + depth * 1.5}rem` }}
            >
              {editing === category.id ? (
                <CategoryForm
                  categories={all}
                  selfId={category.id}
                  initial={{
                    name: category.name,
                    slug: category.slug,
                    description: category.description,
                    parentId: category.parentId ?? "",
                  }}
                  submitLabel="Save changes"
                  pending={mutation.pending}
                  onSubmit={(draft) =>
                    void run(`/api/admin/categories/${category.id}`, "PATCH", {
                      ...body(draft),
                      slug: draft.slug.trim() || category.slug,
                    }).then((ok) => ok && setEditing(null))
                  }
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {category.name}
                      {category.isDefault ? (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                          Default
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      /{category.slug} · {category.count} published · {category.totalCount} in total
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="h-11"
                      onClick={() => setEditing(category.id)}
                    >
                      Edit<span className="sr-only"> {category.name}</span>
                    </Button>
                    {category.isDefault ? null : confirm === category.id ? (
                      <Button
                        variant="destructive"
                        className="h-11"
                        disabled={mutation.pending}
                        onClick={() =>
                          void run(`/api/admin/categories/${category.id}`, "DELETE").then(() =>
                            setConfirm(null),
                          )
                        }
                      >
                        Confirm delete<span className="sr-only"> {category.name}</span>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="h-11"
                        onClick={() => setConfirm(category.id)}
                      >
                        Delete<span className="sr-only"> {category.name}</span>
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          Deleting a category keeps its posts: they move to its parent&apos;s level or to
          Uncategorized.
        </p>
      </section>

      <section aria-labelledby="tags-heading">
        <h2 id="tags-heading" className="mb-4 font-display text-2xl text-forest">
          Tags
        </h2>
        {tags.data.tags.length === 0 ? (
          <p className="text-muted-foreground">No tags yet. Add them while writing a post.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60">
            {tags.data.tags.map((tag) => (
              <li key={tag.id} className="px-4 py-3">
                {tagEditing === tag.id ? (
                  <form
                    noValidate
                    className="grid gap-4 sm:grid-cols-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(`/api/admin/tags/${tag.id}`, "PATCH", {
                        name: tagDraft.name,
                        slug: tagDraft.slug,
                      }).then((ok) => ok && setTagEditing(null));
                    }}
                  >
                    <TextField
                      label="Name"
                      value={tagDraft.name}
                      onChange={(event) => setTagDraft((d) => ({ ...d, name: event.target.value }))}
                    />
                    <TextField
                      label="Slug"
                      value={tagDraft.slug}
                      onChange={(event) => setTagDraft((d) => ({ ...d, slug: event.target.value }))}
                    />
                    <div className="flex gap-3 sm:col-span-2">
                      <Button type="submit" disabled={mutation.pending} className="h-11">
                        Save changes
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        onClick={() => setTagEditing(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{tag.name}</p>
                      <p className="text-xs text-muted-foreground">
                        /{tag.slug} · {tag.count} published
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="h-11"
                        onClick={() => {
                          setTagDraft({ name: tag.name, slug: tag.slug });
                          setTagEditing(tag.id);
                        }}
                      >
                        Edit<span className="sr-only"> {tag.name}</span>
                      </Button>
                      {confirm === `tag:${tag.id}` ? (
                        <Button
                          variant="destructive"
                          className="h-11"
                          disabled={mutation.pending}
                          onClick={() =>
                            void run(`/api/admin/tags/${tag.id}`, "DELETE").then(() =>
                              setConfirm(null),
                            )
                          }
                        >
                          Confirm delete<span className="sr-only"> {tag.name}</span>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="h-11"
                          onClick={() => setConfirm(`tag:${tag.id}`)}
                        >
                          Delete<span className="sr-only"> {tag.name}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
