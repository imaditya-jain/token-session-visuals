"use client";

import { useState } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { auditLabel } from "@/lib/audit-labels";

type Entry = {
  id: string;
  action: string;
  actorName?: string;
  actorEmail?: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, string | number | boolean | null>;
  ip?: string;
  createdAt: string;
};
type Page = { entries: Entry[]; nextCursor?: string };

const when = (iso: string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/** Newest-first audit entries. `paged` adds a "Load more" button that follows the server's cursor. */
export default function ActivityList({ pageSize, paged }: { pageSize: number; paged: boolean }) {
  const first = useApiResource<Page>(`/api/admin/audit?limit=${pageSize}`);
  // Pages after the first, fetched on demand; `cursor` always points at the next unread page.
  const [later, setLater] = useState<{ entries: Entry[]; cursor: string | undefined } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

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
        Couldn&apos;t load activity.{" "}
        <button className="underline" onClick={first.retry}>
          Try again
        </button>
      </div>
    );
  }

  const entries = [...first.data.entries, ...(later?.entries ?? [])];
  const cursor = later ? later.cursor : first.data.nextCursor;

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const query = new URLSearchParams({ limit: String(pageSize), before: cursor });
      const page = await apiFetch<Page>(`/api/admin/audit?${query.toString()}`);
      setLater({ entries: [...(later?.entries ?? []), ...page.entries], cursor: page.nextCursor });
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  if (entries.length === 0)
    return <p className="text-muted-foreground">Nothing has happened yet.</p>;

  return (
    <div>
      <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{auditLabel(entry.action)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {entry.actorName ? `${entry.actorName} (${entry.actorEmail})` : "No signed-in user"}
                {entry.ip ? ` · ${entry.ip}` : ""}
              </p>
            </div>
            <time dateTime={entry.createdAt} className="text-xs text-muted-foreground">
              {when(entry.createdAt)}
            </time>
          </li>
        ))}
      </ul>
      {paged && cursor ? (
        <div className="mt-4 text-center">
          <Button
            variant="outline"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            className="h-11"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
          {moreFailed ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              Couldn&apos;t load more. Try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
