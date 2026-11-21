"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { NotificationList } from "@/lib/notifications";

const card = "rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8";
const POLL_MS = 60_000;

/**
 * Order updates for the signed-in customer: received, shipped, cancelled. There is no push channel yet (that needs a
 * long-lived connection, which the serverless hosting here doesn't offer), so the list refreshes quietly every
 * minute while the page is visible, and again whenever the tab becomes visible.
 */
export default function NotificationsPanel() {
  const [list, setList] = useState<NotificationList | null>(null);
  const [failed, setFailed] = useState(false);
  const [marking, setMarking] = useState(false);
  // Bumping this re-runs the fetch below: used by the timer, the visibility handler and after "mark all read".
  const [refreshes, setRefreshes] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<NotificationList>("/api/notifications")
      .then((next) => {
        if (cancelled) return;
        setList(next);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshes]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setRefreshes((count) => count + 1);
    };
    const timer = window.setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const markAllRead = async () => {
    setMarking(true);
    try {
      await apiFetch<unknown>("/api/notifications/read", { method: "POST", json: { all: true } });
      setRefreshes((count) => count + 1);
    } catch {
      setFailed(true);
    } finally {
      setMarking(false);
    }
  };

  const unread = list?.unreadCount ?? 0;

  return (
    <section className={card} aria-labelledby="updates-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="updates-heading" className="font-display text-2xl font-medium text-forest">
          Order updates
          {unread > 0 ? (
            <span className="ml-3 align-middle text-sm font-semibold text-clay-deep">
              {unread} new
            </span>
          ) : null}
        </h2>
        {unread > 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={marking}
            onClick={markAllRead}
            className="h-10 px-5"
          >
            {marking ? "Marking…" : "Mark all as read"}
          </Button>
        ) : null}
      </div>

      {failed ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Couldn&apos;t load your updates right now. We&apos;ll try again shortly.
        </p>
      ) : null}

      {list === null ? (
        <div aria-hidden className="mt-6 space-y-3">
          <div className="h-5 w-1/2 rounded bg-muted" />
          <div className="h-4 w-3/4 rounded bg-muted" />
        </div>
      ) : list.items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No updates yet. We&apos;ll tell you here when an order is received, shipped or changed.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border">
          {list.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-4"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  {item.title}
                  {item.read ? null : (
                    <span className="rounded-full bg-sage-light px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-forest">
                      New
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{item.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
              </div>
              <Link
                href={item.link}
                className="inline-flex min-h-11 items-center text-sm font-semibold text-forest underline-offset-4 hover:text-clay hover:underline"
              >
                View order
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
