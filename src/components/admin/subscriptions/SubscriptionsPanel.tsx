"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import PageHeader from "@/components/admin/PageHeader";
import Skeleton from "@/components/admin/Skeleton";
import StatusPill from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatDateTime, formatMoney, statusLabel, type Tone } from "@/lib/order-format";
import type { SubscriptionListPage } from "@/lib/subscriptions";

const field =
  "h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export const subscriptionTone = (status: string): Tone =>
  status === "ACTIVE" ? "good" : status === "PAUSED" ? "warn" : "neutral";

const TABS = [
  { id: "", label: "All" },
  { id: "ACTIVE", label: "Active" },
  { id: "PAUSED", label: "Paused" },
  { id: "CANCELLED", label: "Cancelled" },
] as const;

export function NotConnected({ message }: { message: string }) {
  return (
    <section role="status" className="rounded-xl bg-card p-6 ring-1 ring-border/60">
      <h2 className="font-display text-xl text-forest">Seal Subscriptions isn&apos;t connected</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{message}</p>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Find the token in the Seal Subscriptions app under Settings, General Settings, API, then add
        it to the server settings as <code>SEAL_API_TOKEN</code>. Nothing is shown until it is
        connected, so no figure here is ever invented.
      </p>
    </section>
  );
}

export default function SubscriptionsPanel() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [items, setItems] = useState<SubscriptionListPage["items"]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const seq = useRef(0);

  const qs = (after?: string) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (applied) p.set("search", applied);
    if (after) p.set("cursor", after);
    return p.toString();
  };

  useEffect(() => {
    const mine = ++seq.current;
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (applied) p.set("search", applied);
    apiFetch<SubscriptionListPage>(`/api/admin/subscriptions?${p.toString()}`)
      .then((page) => {
        if (mine !== seq.current) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((e: unknown) => {
        if (mine === seq.current)
          setError(
            e instanceof ApiError
              ? { code: e.code, message: e.message }
              : { code: "network", message: "Network problem." },
          );
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false);
      });
  }, [status, applied]);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try {
      const page = await apiFetch<SubscriptionListPage>(`/api/admin/subscriptions?${qs(cursor)}`);
      setItems((c) => [...c, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError({
        code: "more",
        message: e instanceof ApiError ? e.message : "Couldn't load more.",
      });
    } finally {
      setMore(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setApplied(search.trim());
  };

  const notConnected = error?.code === "seal_not_configured" || error?.code === "seal_rejected";
  return (
    <>
      <PageHeader
        title="Subscriptions"
        lead="Gardening plans, live from Seal Subscriptions, which does the billing."
      />
      {notConnected && error ? (
        <NotConnected message={error.message} />
      ) : (
        <>
          <div role="tablist" aria-label="Subscription views" className="mb-4 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={status === t.id}
                onClick={() => {
                  setLoading(true);
                  setStatus(t.id);
                }}
                className={`min-h-11 rounded-full px-4 text-sm ${status === t.id ? "bg-forest text-cream" : "bg-card ring-1 ring-border hover:bg-muted"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <form
            onSubmit={submit}
            role="search"
            aria-label="Search subscriptions"
            className="mb-5 flex flex-wrap items-end gap-2"
          >
            <div className="min-w-56 flex-1">
              <label htmlFor="sub-search" className="mb-1 block text-xs text-muted-foreground">
                Customer name or email
              </label>
              <input
                id="sub-search"
                className={`${field} w-full`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-11">
              Search
            </Button>
          </form>
          {error && !notConnected ? (
            <p
              role="alert"
              className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error.message}
            </p>
          ) : null}
          {loading ? (
            <Skeleton variant="list" />
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscriptions match.</p>
          ) : (
            <>
              <ul
                aria-label="Subscriptions"
                className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60"
              >
                {items.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/admin/subscriptions/${s.id}`}
                      className="grid min-h-16 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[1fr_9rem_8rem_7rem]"
                    >
                      <span className="min-w-0 truncate text-sm">
                        <span className="font-medium text-forest">{s.customerName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {s.plan || s.items} · every {s.interval.replace(/^1 /, "")}
                        </span>
                      </span>
                      <span>
                        <StatusPill
                          label={statusLabel(s.status)}
                          tone={subscriptionTone(s.status)}
                        />
                      </span>
                      <span className="hidden text-xs text-muted-foreground sm:block">
                        {s.nextBilling ? `Next ${formatDateTime(s.nextBilling)}` : "—"}
                      </span>
                      <span className="text-right text-sm tabular-nums">
                        {s.total
                          ? formatMoney({ amount: s.total, currency: s.currency || "USD" })
                          : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {cursor ? (
                <Button
                  variant="outline"
                  className="mt-4 h-11"
                  disabled={more}
                  onClick={() => void loadMore()}
                >
                  {more ? "Loading…" : "Load more"}
                </Button>
              ) : null}
            </>
          )}
        </>
      )}
    </>
  );
}
