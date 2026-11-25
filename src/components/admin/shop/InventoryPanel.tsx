"use client";

import { useEffect, useState } from "react";

import PageHeader from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { LocationView, StockRow } from "@/lib/products";
import { useAppSelector } from "@/store/hooks";
import Skeleton from "@/components/admin/Skeleton";

const field =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const REASONS: { value: string; label: string }[] = [
  { value: "correction", label: "Correction" },
  { value: "received", label: "Stock received" },
  { value: "damaged", label: "Damaged" },
  { value: "shrinkage", label: "Lost or shrinkage" },
  { value: "cycle_count_available", label: "Stock count" },
  { value: "movement_created", label: "Moved between places" },
];

type Page = { rows: StockRow[]; nextCursor: string | null; threshold: number };
type HistoryItem = {
  id: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  locationName: string;
  delta: number;
  quantityAfter: number;
  reason: string;
  note: string;
  actorName: string;
  createdAt: string;
};

const messageOf = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : "Network problem. Check your connection and try again.";

export default function InventoryPanel() {
  const canWrite = useAppSelector(
    (s) => s.admin.access?.permissions.includes("inventory:write") ?? false,
  );
  const [view, setView] = useState<"low" | "sold-out" | "history">("low");
  const [rows, setRows] = useState<StockRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(5);
  const [thresholdText, setThresholdText] = useState("5");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [locations, setLocations] = useState<LocationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<StockRow | null>(null);
  const [form, setForm] = useState({ locationId: "", delta: "", reason: "correction", note: "" });
  const [saving, setSaving] = useState(false);

  const [reloads, setReloads] = useState(0);
  const reload = () => {
    setLoading(true);
    setReloads((n) => n + 1);
  };

  const apply = (after: string | undefined, data: Page) => {
    setRows((current) => (after ? [...current, ...data.rows] : data.rows));
    setCursor(data.nextCursor);
    setThreshold(data.threshold);
  };

  useEffect(() => {
    let cancelled = false;
    const request =
      view === "history"
        ? apiFetch<{ total: number; items: HistoryItem[] }>(
            "/api/admin/inventory/history?perPage=50",
          ).then((data) => {
            if (cancelled) return;
            setHistory(data.items);
            setHistoryTotal(data.total);
          })
        : apiFetch<Page>(`/api/admin/inventory${view === "sold-out" ? "?soldOut=1" : ""}`).then(
            (data) => {
              if (!cancelled) apply(undefined, data);
            },
          );
    request
      .catch((caught: unknown) => {
        if (!cancelled) setError(messageOf(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, reloads]);

  const loadMore = async (after: string) => {
    setLoading(true);
    try {
      apply(
        after,
        await apiFetch<Page>(
          `/api/admin/inventory?${view === "sold-out" ? "soldOut=1&" : ""}after=${encodeURIComponent(after)}`,
        ),
      );
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    apiFetch<{ locations: LocationView[] }>("/api/admin/shop/locations")
      .then((data) => {
        const active = data.locations.filter((l) => l.active);
        setLocations(active);
        setForm((f) => ({ ...f, locationId: f.locationId || active[0]?.id || "" }));
      })
      .catch(() => setLocations([]));
  }, []);

  const adjust = async () => {
    if (!editing) return;
    const delta = Number(form.delta);
    if (!Number.isInteger(delta) || delta === 0) {
      setError("Enter a whole number other than 0. Use a minus sign to remove stock.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/api/admin/inventory/adjust", {
        method: "POST",
        json: {
          inventoryItemId: editing.inventoryItemId,
          locationId: form.locationId,
          delta,
          reason: form.reason,
          note: form.note,
        },
      });
      setNotice(`Stock for ${editing.productTitle} updated in Shopify.`);
      setEditing(null);
      setForm((f) => ({ ...f, delta: "", note: "", reason: "correction" }));
      reload();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSaving(false);
    }
  };

  const saveThreshold = async () => {
    const value = Number(thresholdText);
    if (!Number.isInteger(value) || value < 0) {
      setError("The low-stock level must be a whole number, 0 or more.");
      return;
    }
    setError(null);
    try {
      await apiFetch("/api/admin/inventory/settings", {
        method: "PUT",
        json: { lowStockThreshold: value },
      });
      setNotice("Low-stock level saved.");
      reload();
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const tabs = [
    { id: "low", label: "Low stock" },
    { id: "sold-out", label: "Sold out" },
    { id: "history", label: "Changes made here" },
  ] as const;

  return (
    <>
      <PageHeader
        title="Inventory"
        lead="Live stock from Shopify. Changes are written to Shopify first."
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

      <div role="tablist" aria-label="Inventory views" className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={view === t.id}
            onClick={() => {
              setView(t.id);
              setEditing(null);
              setNotice(null);
            }}
            className={`min-h-11 rounded-full px-4 text-sm ${view === t.id ? "bg-forest text-cream" : "bg-card ring-1 ring-border hover:bg-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "low" && canWrite ? (
        <div className="mb-5 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="threshold" className="mb-1 block text-xs text-muted-foreground">
              Count as low at or below
            </label>
            <input
              id="threshold"
              className={`${field} w-32`}
              inputMode="numeric"
              value={thresholdText}
              onChange={(e) => setThresholdText(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => void saveThreshold()}
          >
            Save level
          </Button>
        </div>
      ) : null}

      {editing ? (
        <section
          aria-label={`Change stock for ${editing.productTitle}`}
          className="mb-6 rounded-xl bg-card p-5 ring-1 ring-border/60"
        >
          <h2 className="font-display text-lg text-forest">
            {editing.productTitle}
            {editing.variantTitle && editing.variantTitle !== "Default Title"
              ? `: ${editing.variantTitle}`
              : ""}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">Now {editing.available} available.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="adj-location" className="mb-1.5 block text-sm font-medium">
                Location
              </label>
              <select
                id="adj-location"
                className={field}
                value={form.locationId}
                onChange={(e) => setForm({ ...form, locationId: e.target.value })}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="adj-delta" className="mb-1.5 block text-sm font-medium">
                Change (+ add, − remove)
              </label>
              <input
                id="adj-delta"
                className={field}
                inputMode="numeric"
                placeholder="e.g. 10 or -2"
                value={form.delta}
                onChange={(e) => setForm({ ...form, delta: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="adj-reason" className="mb-1.5 block text-sm font-medium">
                Reason
              </label>
              <select
                id="adj-reason"
                className={field}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="adj-note" className="mb-1.5 block text-sm font-medium">
                Note (optional)
              </label>
              <input
                id="adj-note"
                className={field}
                maxLength={300}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button className="h-11" disabled={saving} onClick={() => void adjust()}>
              {saving ? "Saving…" : "Update stock"}
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {loading && rows.length === 0 && history.length === 0 ? (
        <Skeleton variant="list" />
      ) : view === "history" ? (
        history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No stock changes have been made here yet. Changes made directly in Shopify are not
            listed.
          </p>
        ) : (
          <>
            <ul
              aria-label="Stock changes"
              className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60"
            >
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <span>
                    <span className="font-medium">{h.productTitle}</span>
                    {h.variantTitle && h.variantTitle !== "Default Title"
                      ? ` (${h.variantTitle})`
                      : ""}
                    <span className="block text-xs text-muted-foreground">
                      {h.locationName} · {h.actorName} · {new Date(h.createdAt).toLocaleString()}
                      {h.note ? ` · ${h.note}` : ""}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {h.delta > 0 ? `+${h.delta}` : h.delta} → {h.quantityAfter}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Showing {history.length} of {historyTotal}.
            </p>
          </>
        )
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {view === "sold-out" ? "Nothing is sold out." : `Nothing is at or below ${threshold}.`}
        </p>
      ) : (
        <>
          <ul
            aria-label={view === "sold-out" ? "Sold-out variants" : "Low-stock variants"}
            className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60"
          >
            {rows.map((r) => (
              <li
                key={r.variantId}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span>
                  <span className="font-medium">{r.productTitle}</span>
                  {r.variantTitle && r.variantTitle !== "Default Title"
                    ? ` (${r.variantTitle})`
                    : ""}
                  {r.sku ? (
                    <span className="block text-xs text-muted-foreground">SKU {r.sku}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{r.available} left</span>
                  {canWrite && r.tracked ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => {
                        setEditing(r);
                        setNotice(null);
                      }}
                    >
                      Change stock<span className="sr-only"> for {r.productTitle}</span>
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {cursor ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 h-11"
              disabled={loading}
              onClick={() => void loadMore(cursor)}
            >
              {loading ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </>
      )}
    </>
  );
}
