"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import Skeleton from "@/components/admin/Skeleton";
import { useAdminMutation } from "@/components/admin/useAdminApi";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api-client";
import type { MediaFolderView, MediaItem, MediaPage, MediaSummary, MediaUsage } from "@/lib/media";

const PAGE_SIZE = 24;
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

const field =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const folderName = (folders: MediaFolderView[], id: string | null) =>
  id ? (folders.find((f) => f.id === id)?.name ?? "") : "";

function Detail({
  item,
  folders,
  onClose,
  onChanged,
}: {
  item: MediaItem;
  folders: MediaFolderView[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const mutation = useAdminMutation();
  const detail = useApiResource<{ media: MediaItem; usages: MediaUsage[] }>(
    `/api/admin/media/${item.id}`,
  );
  const [alt, setAlt] = useState(item.alt);
  const [folderId, setFolderId] = useState(item.folderId ?? "");
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  const current = detail.status === "ready" ? detail.data.media : item;
  const usages = detail.status === "ready" ? detail.data.usages : null;

  const save = async () => {
    setMessage(null);
    const done = await mutation.run(`/api/admin/media/${item.id}`, "PATCH", {
      alt,
      folderId: folderId || null,
    });
    if (done) {
      setMessage("Saved.");
      onChanged();
      detail.retry();
    }
  };
  const remove = async () => {
    if (await mutation.run(`/api/admin/media/${item.id}`, "DELETE")) {
      onChanged();
      onClose();
    }
    setConfirm(false);
  };
  const replace = async (file: File | undefined) => {
    setMessage(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setMessage("Images can be up to 4 MB.");
    const form = new FormData();
    form.append("file", file);
    const done = await mutation.run<{ updatedReferences: number }>(
      `/api/admin/media/${item.id}/file`,
      "PUT",
      form,
    );
    if (replaceInput.current) replaceInput.current.value = "";
    if (done) {
      setMessage(
        done.updatedReferences > 0
          ? `Replaced. ${done.updatedReferences} ${done.updatedReferences === 1 ? "place was" : "places were"} updated to the new picture.`
          : "Replaced. Nothing was using this picture yet.",
      );
      onChanged();
      detail.retry();
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current.url);
      setMessage("Link copied.");
    } catch {
      setMessage("Couldn't copy. Select the link and copy it yourself.");
    }
  };

  return (
    <div className="mt-6 space-y-5">
      <Image
        key={current.url}
        src={current.url}
        alt={current.alt || current.filename}
        width={current.width ?? 800}
        height={current.height ?? 600}
        sizes="(min-width: 640px) 480px, 100vw"
        className="max-h-80 w-full rounded-lg bg-sand object-contain"
      />
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">File</dt>
        <dd className="truncate text-right">{current.filename}</dd>
        <dt className="text-muted-foreground">Size</dt>
        <dd className="text-right">{sizeLabel(current.bytes)}</dd>
        {current.width && current.height ? (
          <>
            <dt className="text-muted-foreground">Dimensions</dt>
            <dd className="text-right">
              {current.width} × {current.height}
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Added</dt>
        <dd className="text-right">
          {new Date(current.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}
        </dd>
        {current.replacedAt ? (
          <>
            <dt className="text-muted-foreground">Replaced</dt>
            <dd className="text-right">
              {new Date(current.replacedAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}
            </dd>
          </>
        ) : null}
      </dl>

      <section aria-labelledby="usage-heading">
        <h3 id="usage-heading" className="mb-2 text-sm font-medium">
          Where it is used
        </h3>
        {usages === null ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : usages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nowhere. It is safe to delete.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {usages.map((u) => (
              <li key={`${u.type}:${u.href}`}>
                <Link href={u.href} className="underline underline-offset-4 hover:text-clay">
                  {u.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <label htmlFor="media-alt" className="mb-1.5 block text-sm font-medium">
          Alternative text
        </label>
        <input
          id="media-alt"
          value={alt}
          maxLength={300}
          onChange={(e) => setAlt(e.target.value)}
          className={field}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Describe the image for people who can&apos;t see it. It also helps search engines.
        </p>
      </div>
      <div>
        <label htmlFor="media-folder" className="mb-1.5 block text-sm font-medium">
          Folder
        </label>
        <select
          id="media-folder"
          value={folderId}
          onChange={(e) => setFolderId(e.target.value)}
          className={field}
        >
          <option value="">Not in a folder</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {mutation.error ? (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-forest">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => void save()}
          disabled={mutation.pending || (alt === item.alt && folderId === (item.folderId ?? ""))}
          className="h-11"
        >
          Save changes
        </Button>
        <input
          ref={replaceInput}
          id="media-replace"
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => void replace(e.target.files?.[0])}
        />
        <Button
          asChild
          variant="outline"
          disabled={mutation.pending}
          className="h-11 cursor-pointer"
        >
          <label htmlFor="media-replace">Replace picture</label>
        </Button>
        <Button variant="outline" onClick={() => void copy()} className="h-11">
          Copy link
        </Button>
        {confirm ? (
          <Button
            variant="destructive"
            onClick={() => void remove()}
            disabled={mutation.pending}
            className="h-11"
          >
            Confirm delete
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setConfirm(true)} className="h-11">
            Delete
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Replacing keeps the same entry and updates every post, page and draft email that uses it.
        Emails already sent keep what they showed.
      </p>
    </div>
  );
}

/**
 * The central picture library. "manage" mode: folders, search, usage, replace, bulk move and cleaning up unused
 * pictures. "pick" mode: the same library, but a click chooses the picture (used by every editor).
 */
export default function MediaLibrary({
  mode,
  onPick,
}: {
  mode: "manage" | "pick";
  onPick?: (media: MediaItem) => void;
}) {
  const [version, setVersion] = useState(0);
  const [folder, setFolder] = useState("all");
  const [usage, setUsage] = useState<"all" | "unused">("all");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [later, setLater] = useState<{ items: MediaItem[]; page: number } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const upload = useAdminMutation();
  const admin = useAdminMutation();
  const input = useRef<HTMLInputElement>(null);

  const query = (page: number) => {
    const p = new URLSearchParams({
      page: String(page),
      perPage: String(PAGE_SIZE),
      folder,
      usage,
    });
    if (applied) p.set("search", applied);
    return p.toString();
  };
  const list = useApiResource<MediaPage>(`/api/admin/media?${query(1)}&v=${version}`);
  const summary = useApiResource<MediaSummary>(`/api/admin/media/summary?v=${version}`);

  const folders = summary.status === "ready" ? summary.data.folders : [];
  const reload = () => {
    setLater(null);
    setSelected([]);
    setVersion((v) => v + 1);
  };

  const onFile = async (file: File | undefined) => {
    setNotice(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setNotice("Images can be up to 4 MB.");
    const form = new FormData();
    form.append("file", file);
    if (folder !== "all" && folder !== "none") form.append("folderId", folder);
    const done = await upload.run<{ media: MediaItem }>("/api/admin/media", "POST", form);
    if (input.current) input.current.value = "";
    if (done) {
      reload();
      if (mode === "pick") onPick?.(done.media);
    }
  };

  const act = async (path: string, method: string, body?: unknown): Promise<boolean> => {
    setNotice(null);
    const done = await admin.run(path, method, body);
    if (done) reload();
    return done !== null;
  };

  const items = list.status === "ready" ? [...list.data.items, ...(later?.items ?? [])] : [];
  const total = list.status === "ready" ? list.data.total : 0;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = (later?.page ?? 1) + 1;
      const data = await apiFetch<MediaPage>(`/api/admin/media?${query(page)}`);
      setLater({ items: [...(later?.items ?? []), ...data.items], page });
    } finally {
      setLoadingMore(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const currentFolder = folders.find((f) => f.id === folder) ?? null;

  const bulkDelete = async () => {
    const done = await admin.run<{ deleted: number; kept: number }>(
      "/api/admin/media/bulk",
      "POST",
      { action: "delete-unused", ids: selected },
    );
    if (done) {
      setNotice(
        `${done.deleted} deleted${done.kept ? `, ${done.kept} kept because ${done.kept === 1 ? "it is" : "they are"} still in use` : ""}.`,
      );
      reload();
    }
  };

  return (
    <div>
      {mode === "manage" && summary.status === "ready" ? (
        <p className="mb-4 text-sm text-muted-foreground">
          {summary.data.total} {summary.data.total === 1 ? "image" : "images"} ·{" "}
          {sizeLabel(summary.data.bytes)} · {summary.data.unused} not used anywhere
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <input
          ref={input}
          id={`media-upload-${mode}`}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button asChild disabled={upload.pending} className="h-11 cursor-pointer">
          <label htmlFor={`media-upload-${mode}`}>
            {upload.pending ? "Uploading…" : "Upload an image"}
          </label>
        </Button>
        <form
          role="search"
          aria-label="Search images"
          className="flex min-w-48 flex-1 items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setLater(null);
            setApplied(search.trim());
          }}
        >
          <div className="flex-1">
            <label
              htmlFor={`media-search-${mode}`}
              className="mb-1 block text-xs text-muted-foreground"
            >
              Search by file name or description
            </label>
            <input
              id={`media-search-${mode}`}
              className={field}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" className="h-11">
            Search
          </Button>
        </form>
        <div>
          <label
            htmlFor={`media-folder-filter-${mode}`}
            className="mb-1 block text-xs text-muted-foreground"
          >
            Folder
          </label>
          <select
            id={`media-folder-filter-${mode}`}
            className={field}
            value={folder}
            onChange={(e) => {
              setLater(null);
              setSelected([]);
              setFolder(e.target.value);
            }}
          >
            <option value="all">All images</option>
            <option value="none">Not in a folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.count})
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">JPEG, PNG, WebP or GIF, up to 4 MB.</p>

      {mode === "manage" ? (
        <div className="mb-5 space-y-3">
          <div role="tablist" aria-label="Show" className="flex gap-2">
            {(["all", "unused"] as const).map((u) => (
              <button
                key={u}
                role="tab"
                aria-selected={usage === u}
                onClick={() => {
                  setLater(null);
                  setSelected([]);
                  setUsage(u);
                }}
                className={`min-h-11 rounded-full px-4 text-sm ${usage === u ? "bg-forest text-cream" : "bg-card ring-1 ring-border hover:bg-muted"}`}
              >
                {u === "all" ? "Everything" : "Not used"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="new-folder" className="mb-1 block text-xs text-muted-foreground">
                New folder
              </label>
              <input
                id="new-folder"
                className={`${field} w-48`}
                maxLength={60}
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={admin.pending || !newFolder.trim()}
              onClick={() =>
                void act("/api/admin/media/folders", "POST", { name: newFolder.trim() }).then(
                  (ok) => ok && setNewFolder(""),
                )
              }
            >
              Create folder
            </Button>
            {currentFolder ? (
              renaming !== null ? (
                <>
                  <div>
                    <label
                      htmlFor="rename-folder"
                      className="mb-1 block text-xs text-muted-foreground"
                    >
                      Folder name
                    </label>
                    <input
                      id="rename-folder"
                      className={`${field} w-48`}
                      maxLength={60}
                      value={renaming}
                      onChange={(e) => setRenaming(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    className="h-11"
                    disabled={admin.pending || !renaming.trim()}
                    onClick={() =>
                      void act(`/api/admin/media/folders/${currentFolder.id}`, "PATCH", {
                        name: renaming.trim(),
                      }).then((ok) => ok && setRenaming(null))
                    }
                  >
                    Save name
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() => setRenaming(null)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() => setRenaming(currentFolder.name)}
                  >
                    Rename folder
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    disabled={admin.pending}
                    onClick={() =>
                      void act(`/api/admin/media/folders/${currentFolder.id}`, "DELETE").then(
                        (ok) => ok && setFolder("all"),
                      )
                    }
                  >
                    Delete folder (keeps its images)
                  </Button>
                </>
              )
            ) : null}
          </div>
          {selected.length > 0 ? (
            <div
              role="region"
              aria-label="Selected images"
              className="flex flex-wrap items-end gap-2 rounded-lg bg-card p-3 ring-1 ring-border/60"
            >
              <span className="mr-2 self-center text-sm font-medium">
                {selected.length} selected
              </span>
              <div>
                <label htmlFor="bulk-move" className="mb-1 block text-xs text-muted-foreground">
                  Move to
                </label>
                <select
                  id="bulk-move"
                  className={`${field} w-48`}
                  defaultValue=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return;
                    void act("/api/admin/media/bulk", "POST", {
                      action: "move",
                      ids: selected,
                      folderId: v === "none" ? null : v,
                    });
                    e.target.value = "";
                  }}
                >
                  <option value="">Choose…</option>
                  <option value="none">Not in a folder</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={admin.pending}
                onClick={() => void bulkDelete()}
              >
                Delete the unused ones
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => setSelected([])}
              >
                Clear selection
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {notice || upload.error || admin.error ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {notice ?? upload.error ?? admin.error}
        </p>
      ) : null}

      {list.status === "loading" ? (
        <Skeleton variant="grid" />
      ) : list.status === "error" ? (
        <div role="alert" className="text-sm text-destructive">
          {list.message}{" "}
          <button className="underline" onClick={list.retry}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          {usage === "unused"
            ? "Every image is in use."
            : applied || folder !== "all"
              ? "No images match."
              : "No images yet. Upload your first one."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((media) => (
            <li key={media.id} className="relative">
              {mode === "manage" ? (
                <label className="absolute left-2 top-2 z-10 flex size-8 cursor-pointer items-center justify-center rounded-md bg-card/90 shadow">
                  <span className="sr-only">Select {media.filename}</span>
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--forest)]"
                    checked={selected.includes(media.id)}
                    onChange={() => toggle(media.id)}
                  />
                </label>
              ) : null}
              <button
                type="button"
                onClick={() => (mode === "pick" ? onPick?.(media) : setOpen(media))}
                className="group block w-full overflow-hidden rounded-lg bg-sand text-left ring-1 ring-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Image
                  src={media.url}
                  alt=""
                  width={240}
                  height={240}
                  sizes="(min-width: 1024px) 200px, 40vw"
                  className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                />
                <span className="block bg-card px-2 py-1.5 text-xs text-foreground">
                  <span className="block truncate">
                    {mode === "pick" ? "Use " : ""}
                    {media.filename}
                  </span>
                  {mode === "manage" ? (
                    <span className="block truncate text-muted-foreground">
                      {media.usageCount > 0 ? `Used in ${media.usageCount}` : "Not used"}
                      {media.folderId ? ` · ${folderName(folders, media.folderId)}` : ""}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length < total ? (
        <div className="mt-6 text-center">
          <Button
            variant="outline"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="h-11"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}

      <Sheet open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetTitle className="font-display text-xl text-forest">Image details</SheetTitle>
          <SheetDescription className="sr-only">
            Description, folder, where it is used, replace and delete
          </SheetDescription>
          {open ? (
            <Detail
              key={open.id}
              item={open}
              folders={folders}
              onClose={() => setOpen(null)}
              onChanged={reload}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
