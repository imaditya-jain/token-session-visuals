"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import PageHeader from "@/components/admin/PageHeader";
import Skeleton from "@/components/admin/Skeleton";
import StatusPill from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/button";
import { apiDownload, apiFetch, ApiError } from "@/lib/api-client";
import {
  formatDateTime,
  formatMoney,
  fulfillmentTone,
  paymentTone,
  statusLabel,
} from "@/lib/order-format";
import type { OrderListPage } from "@/lib/orders-admin";
import { numericOf } from "@/lib/products";
import { useAppSelector } from "@/store/hooks";

const field =
  "h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const TABS = [
  { id: "all", label: "All" },
  { id: "unfulfilled", label: "Unfulfilled" },
  { id: "unpaid", label: "Unpaid" },
  { id: "open", label: "Open" },
  { id: "cancelled", label: "Cancelled" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const filtersOf = (tab: Tab): Record<string, string> => {
  switch (tab) {
    case "unfulfilled":
      return { state: "open", fulfillment: "UNFULFILLED" };
    case "unpaid":
      return { state: "open", payment: "PENDING" };
    case "open":
      return { state: "open" };
    case "cancelled":
      return { state: "cancelled" };
    default:
      return {};
  }
};

export default function OrdersPanel() {
  const canExport = useAppSelector(
    (s) => s.admin.access?.permissions.includes("orders:export") ?? false,
  );
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<OrderListPage["items"]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const seq = useRef(0);

  const queryString = useCallback(
    (after?: string): string => {
      const p = new URLSearchParams(filtersOf(tab));
      if (applied) p.set("search", applied);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (after) p.set("after", after);
      return p.toString();
    },
    [tab, applied, from, to],
  );

  useEffect(() => {
    const mine = ++seq.current;
    apiFetch<OrderListPage>(`/api/admin/orders?${queryString()}`)
      .then((page) => {
        if (mine !== seq.current) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((e: unknown) => {
        if (mine === seq.current)
          setError(e instanceof ApiError ? e.message : "Couldn't load orders.");
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false);
      });
  }, [queryString]);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try {
      const page = await apiFetch<OrderListPage>(`/api/admin/orders?${queryString(cursor)}`);
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load more orders.");
    } finally {
      setMore(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { blob, filename } = await apiDownload(`/api/admin/orders/export?${queryString()}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const change = (next: () => void) => {
    setLoading(true);
    next();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    change(() => setApplied(search.trim()));
  };

  return (
    <>
      <PageHeader
        title="Orders"
        lead="Live from Shopify. Open an order to fulfil, refund or cancel it."
        action={
          canExport ? (
            <Button
              variant="outline"
              className="h-11"
              disabled={exporting}
              onClick={() => void exportCsv()}
            >
              {exporting ? "Preparing…" : "Export CSV"}
            </Button>
          ) : undefined
        }
      />
      <div role="tablist" aria-label="Order views" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => change(() => setTab(t.id))}
            className={`min-h-11 rounded-full px-4 text-sm ${tab === t.id ? "bg-forest text-cream" : "bg-card ring-1 ring-border hover:bg-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={submit}
        role="search"
        aria-label="Search orders"
        className="mb-5 flex flex-wrap items-end gap-2"
      >
        <div className="min-w-56 flex-1">
          <label htmlFor="order-search" className="mb-1 block text-xs text-muted-foreground">
            Order number, name or email
          </label>
          <input
            id="order-search"
            className={`${field} w-full`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="order-from" className="mb-1 block text-xs text-muted-foreground">
            From
          </label>
          <input
            id="order-from"
            type="date"
            className={field}
            value={from}
            onChange={(e) => change(() => setFrom(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="order-to" className="mb-1 block text-xs text-muted-foreground">
            To
          </label>
          <input
            id="order-to"
            type="date"
            className={field}
            value={to}
            onChange={(e) => change(() => setTo(e.target.value))}
          />
        </div>
        <Button type="submit" className="h-11">
          Search
        </Button>
      </form>

      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <Skeleton variant="list" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders match.</p>
      ) : (
        <>
          <ul
            aria-label="Orders"
            className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60"
          >
            {items.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/orders/${numericOf(o.id)}`}
                  className="grid min-h-16 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[6rem_1fr_auto_auto_6rem]"
                >
                  <span className="font-medium text-forest">{o.name}</span>
                  <span className="min-w-0 truncate text-sm">
                    {o.customerName}
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(o.createdAt)} · {o.itemCount}{" "}
                      {o.itemCount === 1 ? "item" : "items"}
                    </span>
                  </span>
                  <span className="col-start-1 flex flex-wrap gap-1.5 sm:col-start-auto">
                    {o.cancelled ? <StatusPill label="Cancelled" tone="bad" /> : null}
                    <StatusPill label={statusLabel(o.payment)} tone={paymentTone(o.payment)} />
                  </span>
                  <span className="hidden sm:block">
                    <StatusPill
                      label={statusLabel(o.fulfillment)}
                      tone={fulfillmentTone(o.fulfillment)}
                    />
                  </span>
                  <span className="text-right text-sm tabular-nums">{formatMoney(o.total)}</span>
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
  );
}
