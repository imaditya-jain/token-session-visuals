"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import PageHeader from "@/components/admin/PageHeader";
import Skeleton from "@/components/admin/Skeleton";
import StatusPill from "@/components/admin/StatusPill";
import { useAdminMutation } from "@/components/admin/useAdminApi";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatDateTime, type Tone } from "@/lib/order-format";
import { REEL_TOPIC_LABELS, type ReelCommentDto, type ReelDto, type ReelStatus } from "@/lib/reels";

type Page = { reels: ReelDto[]; nextCursor: string | null; counts: Record<string, number> };

const TABS: { id: ReelStatus; label: string }[] = [
  { id: "pending", label: "Held (reported)" },
  { id: "approved", label: "Live" },
  { id: "rejected", label: "Rejected" },
  { id: "removed", label: "Removed" },
];

const tone: Record<string, Tone> = {
  pending: "warn",
  approved: "good",
  rejected: "neutral",
  removed: "neutral",
};

function Comments({ reelId }: { reelId: string }) {
  const [comments, setComments] = useState<ReelCommentDto[] | null>(null);
  const { run, error } = useAdminMutation();

  useEffect(() => {
    let live = true;
    apiFetch<{ comments: ReelCommentDto[] }>(`/api/admin/reels/${reelId}/comments`)
      .then((result) => live && setComments(result.comments))
      .catch(() => live && setComments([]));
    return () => {
      live = false;
    };
  }, [reelId]);

  if (comments === null) return <p className="text-xs text-muted-foreground">Loading comments…</p>;
  if (comments.length === 0) return <p className="text-xs text-muted-foreground">No comments.</p>;
  return (
    <>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <ul aria-label="Comments" className="divide-y divide-border text-sm">
        {comments.map((comment) => (
          <li key={comment.id} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0 break-words">
              <span className="font-medium text-forest">{comment.author}</span>{" "}
              <span className="text-muted-foreground">{comment.text}</span>
            </span>
            <Button
              variant="outline"
              className="h-9 shrink-0"
              aria-label={`Remove comment by ${comment.author}`}
              onClick={async () => {
                await run(`/api/admin/reels/${reelId}/comments/${comment.id}`, "DELETE");
                setComments((current) => current?.filter((c) => c.id !== comment.id) ?? null);
              }}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}

function ReelCard({
  reel,
  onDecision,
}: {
  reel: ReelDto;
  onDecision: (id: string, status: "approved" | "rejected" | "removed") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const decide = async (status: "approved" | "rejected" | "removed") => {
    setBusy(true);
    await onDecision(reel.id, status);
    setBusy(false);
  };
  return (
    <li className="overflow-hidden rounded-xl bg-card ring-1 ring-border/60">
      <div className="grid gap-4 p-4 sm:grid-cols-[12rem_1fr]">
        <div className="aspect-[9/16] max-h-72 overflow-hidden rounded-lg bg-muted">
          {reel.kind === "video" ? (
            <video
              src={reel.mediaUrl}
              controls
              preload="metadata"
              playsInline
              aria-label={`Video by ${reel.author}`}
              className="h-full w-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- moderators must see the stored file itself, byte for byte
            <img
              src={reel.mediaUrl}
              alt={reel.caption || `Photo by ${reel.author}`}
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              label={TABS.find((t) => t.id === reel.status)?.label ?? reel.status}
              tone={tone[reel.status] ?? "neutral"}
            />
            <span className="text-xs text-muted-foreground">
              {reel.author} · {REEL_TOPIC_LABELS[reel.topic]} · {formatDateTime(reel.createdAt)}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm">{reel.caption || "No caption."}</p>
          {reel.products.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Linked products: {reel.products.map((p) => p.name).join(", ")}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {reel.likes} likes · {reel.comments} comments
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {reel.status !== "approved" ? (
              <Button className="h-11" disabled={busy} onClick={() => decide("approved")}>
                Approve
              </Button>
            ) : null}
            {reel.status === "pending" ? (
              <Button
                variant="outline"
                className="h-11"
                disabled={busy}
                onClick={() => decide("rejected")}
              >
                Reject
              </Button>
            ) : null}
            {reel.status === "approved" || reel.status === "pending" ? (
              <Button
                variant="outline"
                className="h-11"
                disabled={busy}
                onClick={() => decide("removed")}
              >
                Remove
              </Button>
            ) : null}
            {reel.comments > 0 ? (
              <Button
                variant="outline"
                className="h-11"
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                {open ? "Hide comments" : `Comments (${reel.comments})`}
              </Button>
            ) : null}
          </div>
          {open ? <Comments reelId={reel.id} /> : null}
        </div>
      </div>
    </li>
  );
}

export default function ReelsPanel() {
  const [status, setStatus] = useState<ReelStatus>("pending");
  const [items, setItems] = useState<ReelDto[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const { run, error: actionError } = useAdminMutation();

  const load = useCallback((which: ReelStatus, after?: string) => {
    const mine = ++seq.current;
    const query = new URLSearchParams({ status: which, ...(after ? { cursor: after } : {}) });
    return apiFetch<Page>(`/api/admin/reels?${query.toString()}`)
      .then((page) => {
        if (mine !== seq.current) return;
        setItems((current) => (after ? [...current, ...page.reels] : page.reels));
        setCursor(page.nextCursor);
        setCounts(page.counts);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (mine === seq.current) {
          setError(caught instanceof ApiError ? caught.message : "Network problem.");
        }
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  const decide = async (id: string, next: "approved" | "rejected" | "removed") => {
    const result = await run<{ reel: ReelDto }>(`/api/admin/reels/${id}`, "PATCH", {
      status: next,
    });
    if (!result) return;
    setItems((current) => current.filter((reel) => reel.id !== id));
    void load(status);
  };

  return (
    <>
      <PageHeader
        title="Reels"
        lead="Photos and short videos from customers go live automatically. Reels that people report are held here until you restore or remove them."
      />
      <div role="tablist" aria-label="Reel views" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={status === tab.id}
            onClick={() => {
              setLoading(true);
              setStatus(tab.id);
            }}
            className={`min-h-11 rounded-full px-4 text-sm ${status === tab.id ? "bg-forest text-cream" : "bg-card ring-1 ring-border hover:bg-muted"}`}
          >
            {tab.label}
            {counts[tab.id] ? ` (${counts[tab.id]})` : ""}
          </button>
        ))}
      </div>
      {error || actionError ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error ?? actionError}
        </p>
      ) : null}
      {loading ? (
        <Skeleton variant="list" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <>
          <ul aria-label="Reels" className="space-y-4">
            {items.map((reel) => (
              <ReelCard key={reel.id} reel={reel} onDecision={decide} />
            ))}
          </ul>
          {cursor ? (
            <Button
              variant="outline"
              className="mt-4 h-11"
              onClick={() => void load(status, cursor)}
            >
              Load more
            </Button>
          ) : null}
        </>
      )}
    </>
  );
}
