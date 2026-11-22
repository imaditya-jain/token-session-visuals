"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import { useAdminMutation } from "@/components/admin/useAdminApi";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api-client";
import type { MediaView } from "@/lib/blog-types";

const PAGE_SIZE = 24;
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

type Page = { items: MediaView[]; total: number };

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function Detail({
  media,
  onClose,
  onChanged,
}: {
  media: MediaView;
  onClose: () => void;
  onChanged: () => void;
}) {
  const mutation = useAdminMutation();
  const [alt, setAlt] = useState(media.alt);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaved(false);
    if (await mutation.run(`/api/admin/media/${media.id}`, "PATCH", { alt })) {
      setSaved(true);
      onChanged();
    }
  };
  const remove = async () => {
    if (await mutation.run(`/api/admin/media/${media.id}`, "DELETE")) {
      onChanged();
      onClose();
    }
    setConfirm(false);
  };

  return (
    <div className="mt-6 space-y-5">
      <Image
        src={media.url}
        alt={media.alt || media.filename}
        width={media.width ?? 800}
        height={media.height ?? 600}
        sizes="(min-width: 640px) 480px, 100vw"
        className="max-h-80 w-full rounded-lg bg-sand object-contain"
      />
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">File</dt>
        <dd className="truncate text-right">{media.filename}</dd>
        <dt className="text-muted-foreground">Size</dt>
        <dd className="text-right">{sizeLabel(media.bytes)}</dd>
        {media.width && media.height ? (
          <>
            <dt className="text-muted-foreground">Dimensions</dt>
            <dd className="text-right">
              {media.width} × {media.height}
            </dd>
          </>
        ) : null}
      </dl>
      <div>
        <label htmlFor="media-alt" className="mb-1.5 block text-sm font-medium">
          Alternative text
        </label>
        <input
          id="media-alt"
          value={alt}
          maxLength={300}
          onChange={(event) => setAlt(event.target.value)}
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Describe the image for people who can&apos;t see it. It also helps search engines.
        </p>
      </div>
      {mutation.error ? (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-forest">
          Saved.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() => void save()}
          disabled={mutation.pending || alt === media.alt}
          className="h-11"
        >
          Save alt text
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
    </div>
  );
}

/**
 * The image library. In "manage" mode a click opens details (alt text, delete); in "pick" mode a click chooses the
 * image (used by the editor for featured and inline images). Uploading is the same in both.
 */
export default function MediaLibrary({
  mode,
  onPick,
}: {
  mode: "manage" | "pick";
  onPick?: (media: MediaView) => void;
}) {
  const [version, setVersion] = useState(0);
  const first = useApiResource<Page>(`/api/admin/media?page=1&perPage=${PAGE_SIZE}&v=${version}`);
  const [later, setLater] = useState<{ items: MediaView[]; page: number } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<MediaView | null>(null);
  const upload = useAdminMutation();
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reload = () => {
    setLater(null);
    setVersion((v) => v + 1);
  };

  const onFile = async (file: File | undefined) => {
    setNotice(null);
    if (!file) return;
    if (file.size > MAX_BYTES) return setNotice("Images can be up to 4 MB.");
    const form = new FormData();
    form.append("file", file);
    const done = await upload.run<{ media: MediaView }>("/api/admin/media", "POST", form);
    if (input.current) input.current.value = "";
    if (done) {
      reload();
      if (mode === "pick") onPick?.(done.media);
    }
  };

  if (first.status === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (first.status === "error") {
    return (
      <div role="alert" className="text-sm text-destructive">
        {first.message}{" "}
        <button className="underline" onClick={first.retry}>
          Try again
        </button>
      </div>
    );
  }

  const items = [...first.data.items, ...(later?.items ?? [])];
  const hasMore = items.length < first.data.total;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = (later?.page ?? 1) + 1;
      const data = await apiFetch<Page>(`/api/admin/media?page=${page}&perPage=${PAGE_SIZE}`);
      setLater({ items: [...(later?.items ?? []), ...data.items], page });
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          ref={input}
          id={`media-upload-${mode}`}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <Button asChild disabled={upload.pending} className="h-11 cursor-pointer">
          <label htmlFor={`media-upload-${mode}`}>
            {upload.pending ? "Uploading…" : "Upload an image"}
          </label>
        </Button>
        <p className="text-xs text-muted-foreground">JPEG, PNG, WebP or GIF, up to 4 MB.</p>
      </div>
      {notice || upload.error ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {notice ?? upload.error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">
          No images yet. Upload your first one.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((media) => (
            <li key={media.id}>
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
                <span className="block truncate bg-card px-2 py-1.5 text-xs text-foreground">
                  {mode === "pick" ? "Use " : ""}
                  {media.filename}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasMore ? (
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
          <SheetDescription className="sr-only">Alternative text and deletion</SheetDescription>
          {open ? (
            <Detail key={open.id} media={open} onClose={() => setOpen(null)} onChanged={reload} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
