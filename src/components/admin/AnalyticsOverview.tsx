"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import Skeleton from "@/components/admin/Skeleton";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { AnalyticsResponse, Section } from "@/lib/analytics";
import { formatMoney } from "@/lib/order-format";

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const daysAgo = (n: number): string => iso(new Date(Date.now() - n * 86_400_000));

type Preset = { id: string; label: string; range: () => { from: string; to: string } };
const PRESETS: Preset[] = [
  { id: "today", label: "Today", range: () => ({ from: daysAgo(0), to: daysAgo(0) }) },
  { id: "7d", label: "Last 7 days", range: () => ({ from: daysAgo(6), to: daysAgo(0) }) },
  { id: "30d", label: "Last 30 days", range: () => ({ from: daysAgo(29), to: daysAgo(0) }) },
  { id: "90d", label: "Last 90 days", range: () => ({ from: daysAgo(89), to: daysAgo(0) }) },
  {
    id: "month",
    label: "This month",
    range: () => ({ from: `${daysAgo(0).slice(0, 7)}-01`, to: daysAgo(0) }),
  },
  {
    id: "last-month",
    label: "Last month",
    range: () => {
      const now = new Date();
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      return { from: iso(first), to: iso(last) };
    },
  },
];

const field =
  "h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Card({ title, children, href }: { title: string; children: ReactNode; href?: string }) {
  const body = (
    <div className="h-full rounded-xl bg-card p-5 ring-1 ring-border/60">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full transition-shadow hover:shadow-md">
      {body}
    </Link>
  ) : (
    body
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Unavailable.</span> {reason}
    </p>
  );
}

function Value<T>({
  section,
  children,
}: {
  section: Section<T>;
  children: (data: T) => ReactNode;
}) {
  return section.status === "ok" ? (
    <>{children(section.data)}</>
  ) : (
    <Unavailable reason={section.reason} />
  );
}

const Big = ({ children }: { children: ReactNode }) => (
  <p className="font-display text-3xl text-forest tabular-nums">{children}</p>
);

function Change({ value }: { value: number | null }) {
  if (value === null)
    return <p className="mt-1 text-xs text-muted-foreground">No earlier period to compare</p>;
  return (
    <p className={`mt-1 text-xs ${value >= 0 ? "text-forest" : "text-destructive"}`}>
      {value >= 0 ? "▲" : "▼"} {Math.abs(value)}% vs previous period
    </p>
  );
}

export default function AnalyticsOverview() {
  const [preset, setPreset] = useState("30d");
  const [custom, setCustom] = useState({ from: daysAgo(29), to: daysAgo(0) });
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const range =
    preset === "custom" ? custom : (PRESETS.find((p) => p.id === preset) ?? PRESETS[2]!).range();
  const { from, to } = range;

  useEffect(() => {
    let cancelled = false;
    apiFetch<AnalyticsResponse>(`/api/admin/analytics?from=${from}&to=${to}`)
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setFailure(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setFailure(e instanceof ApiError ? e.message : "Network problem.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const choose = (id: string) => {
    setLoading(true);
    setPreset(id);
  };
  const max =
    data?.sales.status === "ok"
      ? Math.max(1, ...data.sales.data.daily.map((d) => Number(d.revenue)))
      : 1;

  return (
    <section aria-labelledby="analytics-heading" className="mb-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 id="analytics-heading" className="font-display text-xl text-forest">
          Business at a glance
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="range-preset" className="mb-1 block text-xs text-muted-foreground">
              Period
            </label>
            <select
              id="range-preset"
              className={field}
              value={preset}
              onChange={(e) => choose(e.target.value)}
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom range</option>
            </select>
          </div>
          {preset === "custom" ? (
            <>
              <div>
                <label htmlFor="range-from" className="mb-1 block text-xs text-muted-foreground">
                  From
                </label>
                <input
                  id="range-from"
                  type="date"
                  className={field}
                  value={custom.from}
                  max={custom.to}
                  onChange={(e) => {
                    setLoading(true);
                    setCustom({ ...custom, from: e.target.value });
                  }}
                />
              </div>
              <div>
                <label htmlFor="range-to" className="mb-1 block text-xs text-muted-foreground">
                  To
                </label>
                <input
                  id="range-to"
                  type="date"
                  className={field}
                  value={custom.to}
                  min={custom.from}
                  onChange={(e) => {
                    setLoading(true);
                    setCustom({ ...custom, to: e.target.value });
                  }}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>

      {failure ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {failure}
        </p>
      ) : loading || !data ? (
        <Skeleton variant="cards" rows={8} />
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground">
            {from} to {to}, in UTC. Figures come live from Shopify; cancelled and voided orders are
            left out.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="Revenue">
              <Value section={data.sales}>
                {(s) => (
                  <>
                    <Big>{formatMoney({ amount: s.revenue, currency: s.currency })}</Big>
                    <Change value={s.change.revenue} />
                  </>
                )}
              </Value>
            </Card>
            <Card title="Orders" href="/admin/orders">
              <Value section={data.sales}>
                {(s) => (
                  <>
                    <Big>{s.orders}</Big>
                    <Change value={s.change.orders} />
                  </>
                )}
              </Value>
            </Card>
            <Card title="Average order">
              <Value section={data.sales}>
                {(s) =>
                  s.averageOrder ? (
                    <Big>{formatMoney({ amount: s.averageOrder, currency: s.currency })}</Big>
                  ) : (
                    <p className="text-sm text-muted-foreground">No orders in this period.</p>
                  )
                }
              </Value>
            </Card>
            <Card title="Items sold">
              <Value section={data.sales}>{(s) => <Big>{s.units}</Big>}</Value>
            </Card>
            <Card title="Refunds">
              <Value section={data.sales}>
                {(s) => <Big>{formatMoney({ amount: s.refunds, currency: s.currency })}</Big>}
              </Value>
            </Card>
            <Card title="Customers">
              <Value section={data.sales}>
                {(s) => (
                  <>
                    <Big>{s.firstTimeCustomers + s.returningCustomers}</Big>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.firstTimeCustomers} first-time, {s.returningCustomers} returning
                    </p>
                  </>
                )}
              </Value>
            </Card>
            <Card title="To fulfil" href="/admin/orders">
              <Value section={data.unfulfilled}>
                {(n) => (
                  <>
                    <Big>{n >= 250 ? "250+" : n}</Big>
                    <p className="mt-1 text-xs text-muted-foreground">
                      open orders waiting to ship
                    </p>
                  </>
                )}
              </Value>
            </Card>
            <Card title="Low stock" href="/admin/shop/inventory">
              <Value section={data.lowStock}>
                {(l) => (
                  <>
                    <Big>{l.more ? `${l.count}+` : l.count}</Big>
                    <p className="mt-1 text-xs text-muted-foreground">
                      items at or below your low-stock level
                    </p>
                  </>
                )}
              </Value>
            </Card>
            <Card title="New enquiries" href="/admin/enquiries/contact">
              <Value section={data.enquiries}>
                {(e) => (
                  <>
                    <Big>{e.contact + e.wholesale}</Big>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {e.contact} contact, {e.wholesale} wholesale
                    </p>
                  </>
                )}
              </Value>
            </Card>
            <Card title="Subscriptions" href="/admin/subscriptions">
              <Value section={data.subscriptions}>
                {(s) => (
                  <>
                    <Big>{s.more ? `${s.active}+` : s.active}</Big>
                    <p className="mt-1 text-xs text-muted-foreground">
                      active · {s.paused}
                      {s.more ? "+" : ""} paused
                    </p>
                  </>
                )}
              </Value>
            </Card>
          </div>

          {data.sales.status === "ok" ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card title="Revenue by day">
                <div
                  role="img"
                  aria-label={`Daily revenue, ${from} to ${to}. Total ${formatMoney({ amount: data.sales.data.revenue, currency: data.sales.data.currency })}.`}
                  className="flex h-40 items-end gap-px"
                >
                  {data.sales.data.daily.map((d) => (
                    <div
                      key={d.date}
                      title={`${d.date}: ${formatMoney({ amount: d.revenue, currency: data.sales.status === "ok" ? data.sales.data.currency : "USD" })}, ${d.orders} orders`}
                      className="min-w-px flex-1 rounded-t-sm bg-forest/80"
                      style={{
                        height: `${Math.max(2, (Number(d.revenue) / max) * 100)}%`,
                        opacity: Number(d.revenue) > 0 ? 1 : 0.25,
                      }}
                    />
                  ))}
                </div>
                <table className="sr-only">
                  <caption>Revenue and orders per day</caption>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Revenue</th>
                      <th>Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sales.data.daily.map((d) => (
                      <tr key={d.date}>
                        <td>{d.date}</td>
                        <td>{d.revenue}</td>
                        <td>{d.orders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.sales.data.uncounted ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    This period has more than 2,000 orders; only the first 2,000 are counted. Choose
                    a shorter period for exact figures.
                  </p>
                ) : null}
              </Card>
              <Card title="Top products">
                {data.sales.data.topProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sales in this period.</p>
                ) : (
                  <ol className="space-y-2 text-sm">
                    {data.sales.data.topProducts.map((p) => (
                      <li key={p.title} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">
                          {p.title}
                          <span className="block text-xs text-muted-foreground">
                            {p.units} sold
                          </span>
                        </span>
                        <span className="tabular-nums">
                          {formatMoney({
                            amount: p.revenue,
                            currency: data.sales.status === "ok" ? data.sales.data.currency : "USD",
                          })}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
