"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import PageHeader from "@/components/admin/PageHeader";
import Skeleton from "@/components/admin/Skeleton";
import StatusPill from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  formatDateTime,
  formatMoney,
  fulfillmentTone,
  paymentTone,
  statusLabel,
} from "@/lib/order-format";
import type { Address, OrderDetail as Order } from "@/lib/orders-admin";
import { useAppSelector } from "@/store/hooks";

const field =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const messageOf = (e: unknown): string =>
  e instanceof ApiError ? e.message : "Network problem. Check your connection and try again.";

function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-border/60">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-forest">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function AddressBlock({ address }: { address: Address | null }) {
  if (!address) return <p className="text-sm text-muted-foreground">None</p>;
  const lines = [
    address.name,
    address.address1,
    address.address2,
    [address.city, address.province, address.zip].filter(Boolean).join(", "),
    address.country,
    address.phone,
  ].filter(Boolean);
  return (
    <address className="space-y-0.5 text-sm not-italic">
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </address>
  );
}

function Detail({ initial }: { initial: Order }) {
  const permissions = useAppSelector((s) => s.admin.access?.permissions ?? []);
  const canWrite = permissions.includes("orders:write");
  const canRefund = permissions.includes("orders:refund");
  const [order, setOrder] = useState(initial);
  const [panel, setPanel] = useState<"refund" | "cancel" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState(initial.note);
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const base = `/api/admin/orders/${order.id.slice(order.id.lastIndexOf("/") + 1)}`;

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const post = (path: string, json: unknown, message: string) =>
    act(async () => {
      const data = await apiFetch<{ order: Order; refunded?: string }>(`${base}${path}`, {
        method: "POST",
        json,
      });
      setOrder(data.order);
      setNotice(data.refunded ? `${message} (${data.refunded}).` : message);
      setPanel(null);
    });

  const saveNotes = () =>
    act(async () => {
      const tags = [
        ...new Set(
          tagsText
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ];
      const data = await apiFetch<{ order: Order }>(base, {
        method: "PATCH",
        json: { note, tags },
      });
      setOrder(data.order);
      setNote(data.order.note);
      setTagsText(data.order.tags.join(", "));
      setNotice("Saved.");
    });

  const cancelled = order.cancelledAt !== null;
  const open = order.fulfillmentOrders.filter(
    (f) => f.lines.some((l) => l.remaining > 0) && f.status !== "CLOSED",
  );

  return (
    <>
      <PageHeader
        title={order.name}
        lead={`Placed ${formatDateTime(order.createdAt)}${order.channel ? ` · ${order.channel}` : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {cancelled ? <StatusPill label="Cancelled" tone="bad" /> : null}
            <StatusPill label={statusLabel(order.payment)} tone={paymentTone(order.payment)} />
            <StatusPill
              label={statusLabel(order.fulfillment)}
              tone={fulfillmentTone(order.fulfillment)}
            />
            <Button asChild variant="outline" className="h-11">
              <Link href="/admin/orders">All orders</Link>
            </Button>
          </div>
        }
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {open.length > 0 && !cancelled
            ? open.map((f) => (
                <FulfilCard
                  key={f.id}
                  fulfillment={f}
                  canWrite={canWrite}
                  busy={busy}
                  onSubmit={(body) => void post("/fulfill", body, "Marked as fulfilled.")}
                />
              ))
            : null}

          <Card
            title="Items"
            action={
              canRefund && !cancelled ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-11"
                    onClick={() => setPanel(panel === "refund" ? null : "refund")}
                  >
                    Refund
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11"
                    onClick={() => setPanel(panel === "cancel" ? null : "cancel")}
                  >
                    Cancel order
                  </Button>
                </div>
              ) : undefined
            }
          >
            {panel === "refund" ? (
              <RefundForm
                order={order}
                busy={busy}
                onSubmit={(body) => void post("/refund", body, "Refund issued")}
                onClose={() => setPanel(null)}
              />
            ) : null}
            {panel === "cancel" ? (
              <CancelForm
                busy={busy}
                onSubmit={(body) => void post("/cancel", body, "Order cancelled.")}
                onClose={() => setPanel(null)}
              />
            ) : null}
            <ul aria-label="Order items" className="divide-y divide-border">
              {order.lines.map((l) => (
                <li key={l.id} className="flex items-center gap-4 py-3">
                  {l.imageUrl ? (
                    <Image
                      src={l.imageUrl}
                      alt=""
                      width={56}
                      height={56}
                      sizes="56px"
                      className="h-14 w-14 shrink-0 rounded-md bg-sand object-cover"
                    />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-md bg-muted" />
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{l.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[l.variantTitle, l.sku ? `SKU ${l.sku}` : ""].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums">
                    {formatMoney(l.discountedUnitPrice)} × {l.quantity}
                  </p>
                  <p className="w-24 text-right text-sm tabular-nums">
                    {formatMoney({
                      amount: (Number(l.discountedUnitPrice.amount) * l.quantity).toFixed(2),
                      currency: l.discountedUnitPrice.currency,
                    })}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Payment">
            <dl className="space-y-1.5 text-sm">
              {(
                [
                  ["Subtotal", order.totals.subtotal],
                  [
                    `Shipping${order.shippingMethod ? ` (${order.shippingMethod})` : ""}`,
                    order.totals.shipping,
                  ],
                  ["Discounts", order.totals.discounts],
                  ["Tax", order.totals.tax],
                ] as const
              ).map(([label, money]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="tabular-nums">{formatMoney(money)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-2 font-medium">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(order.totals.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="tabular-nums">{formatMoney(order.totals.received)}</dd>
              </div>
              {Number(order.totals.refunded.amount) > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Refunded</dt>
                  <dd className="tabular-nums">−{formatMoney(order.totals.refunded)}</dd>
                </div>
              ) : null}
            </dl>
            {order.transactions.length > 0 ? (
              <ul
                aria-label="Payment transactions"
                className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground"
              >
                {order.transactions.map((t) => (
                  <li key={t.id} className="flex justify-between gap-3">
                    <span>
                      {statusLabel(t.kind)} · {statusLabel(t.status)} · {t.gateway}
                      {t.processedAt ? ` · ${formatDateTime(t.processedAt)}` : ""}
                    </span>
                    <span className="tabular-nums">{formatMoney(t.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {order.fulfillments.length > 0 ? (
            <Card title="Shipments">
              <ul className="space-y-3 text-sm">
                {order.fulfillments.map((f) => (
                  <li key={f.id}>
                    <p>
                      {statusLabel(f.status)} · {formatDateTime(f.createdAt)}
                    </p>
                    {f.tracking.map((t, i) => (
                      <p key={i} className="text-muted-foreground">
                        {t.company}{" "}
                        {t.url ? (
                          <a
                            href={t.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            {t.number || "Track"}
                          </a>
                        ) : (
                          t.number
                        )}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Timeline">
            <ol
              aria-label="Order timeline"
              className="space-y-3 border-l border-border pl-4 text-sm"
            >
              {order.timeline.map((e, i) => (
                <li key={i}>
                  <p>{e.message}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside aria-label="Order details" className="min-w-0 space-y-6">
          <Card title="Customer">
            {order.customer ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium">{order.customer.name}</p>
                <p className="text-muted-foreground">
                  {order.customer.orders} {order.customer.orders === 1 ? "order" : "orders"}
                </p>
                {order.customer.email ? (
                  <p>
                    <a className="underline" href={`mailto:${order.customer.email}`}>
                      {order.customer.email}
                    </a>
                  </p>
                ) : null}
                {order.customer.phone ? <p>{order.customer.phone}</p> : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Guest checkout{order.email ? `: ${order.email}` : ""}
              </p>
            )}
          </Card>
          <Card title="Shipping address">
            <AddressBlock address={order.shippingAddress} />
          </Card>
          <Card title="Billing address">
            <AddressBlock address={order.billingAddress} />
          </Card>
          <Card title="Notes and tags">
            <fieldset disabled={!canWrite || busy} className="space-y-3 border-0 p-0">
              <div>
                <label htmlFor="o-note" className="mb-1 block text-xs text-muted-foreground">
                  Internal note
                </label>
                <textarea
                  id="o-note"
                  rows={3}
                  maxLength={5000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="o-tags" className="mb-1 block text-xs text-muted-foreground">
                  Tags (comma separated)
                </label>
                <input
                  id="o-tags"
                  className={field}
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                />
              </div>
              {canWrite ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => void saveNotes()}
                >
                  Save notes
                </Button>
              ) : null}
            </fieldset>
          </Card>
        </aside>
      </div>
    </>
  );
}

function FulfilCard({
  fulfillment,
  canWrite,
  busy,
  onSubmit,
}: {
  fulfillment: Order["fulfillmentOrders"][number];
  canWrite: boolean;
  busy: boolean;
  onSubmit: (body: unknown) => void;
}) {
  const [company, setCompany] = useState("");
  const [number, setNumber] = useState("");
  const [url, setUrl] = useState("");
  const [notify, setNotify] = useState(true);
  return (
    <Card title={`Unfulfilled${fulfillment.location ? ` · ${fulfillment.location}` : ""}`}>
      <ul className="mb-4 space-y-1 text-sm">
        {fulfillment.lines
          .filter((l) => l.remaining > 0)
          .map((l) => (
            <li key={l.id}>
              {l.title} × {l.remaining}
            </li>
          ))}
      </ul>
      {canWrite ? (
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              fulfillmentOrderId: fulfillment.id,
              trackingCompany: company,
              trackingNumber: number,
              trackingUrl: url,
              notifyCustomer: notify,
            });
          }}
        >
          <div>
            <label
              htmlFor={`c-${fulfillment.id}`}
              className="mb-1 block text-xs text-muted-foreground"
            >
              Carrier
            </label>
            <input
              id={`c-${fulfillment.id}`}
              className={field}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor={`n-${fulfillment.id}`}
              className="mb-1 block text-xs text-muted-foreground"
            >
              Tracking number
            </label>
            <input
              id={`n-${fulfillment.id}`}
              className={field}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor={`u-${fulfillment.id}`}
              className="mb-1 block text-xs text-muted-foreground"
            >
              Tracking link (https)
            </label>
            <input
              id={`u-${fulfillment.id}`}
              className={field}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-3">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--forest)]"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
            />
            Email the customer a shipping confirmation
          </label>
          <Button type="submit" className="h-11 sm:col-span-3 sm:w-fit" disabled={busy}>
            Mark as fulfilled
          </Button>
        </form>
      ) : null}
    </Card>
  );
}

function RefundForm({
  order,
  busy,
  onSubmit,
  onClose,
}: {
  order: Order;
  busy: boolean;
  onSubmit: (body: unknown) => void;
  onClose: () => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [shipping, setShipping] = useState(false);
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const lines = order.lines
    .filter((l) => (qty[l.id] ?? 0) > 0)
    .map((l) => ({ lineItemId: l.id, quantity: qty[l.id] ?? 0, restock: restock[l.id] ?? false }));
  return (
    <form
      aria-label="Refund items"
      className="mb-5 space-y-3 rounded-lg bg-background p-4 ring-1 ring-border/60"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ lines, refundShipping: shipping, note, notifyCustomer: notify });
      }}
    >
      <p className="text-sm text-muted-foreground">
        Choose what to refund. Shopify works out the exact amount.
      </p>
      {order.lines
        .filter((l) => l.refundableQuantity > 0)
        .map((l) => (
          <div key={l.id} className="flex flex-wrap items-center gap-3 text-sm">
            <span className="min-w-40 flex-1">{l.title}</span>
            <label className="flex items-center gap-2">
              <span className="sr-only">Quantity to refund for {l.title}</span>
              <input
                type="number"
                min={0}
                max={l.refundableQuantity}
                className={`${field} w-20`}
                value={qty[l.id] ?? 0}
                onChange={(e) =>
                  setQty({
                    ...qty,
                    [l.id]: Math.min(
                      l.refundableQuantity,
                      Math.max(0, Number(e.target.value) || 0),
                    ),
                  })
                }
              />
              <span className="text-xs text-muted-foreground">of {l.refundableQuantity}</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--forest)]"
                checked={restock[l.id] ?? false}
                onChange={(e) => setRestock({ ...restock, [l.id]: e.target.checked })}
              />
              Put back in stock<span className="sr-only"> for {l.title}</span>
            </label>
          </div>
        ))}
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--forest)]"
          checked={shipping}
          onChange={(e) => setShipping(e.target.checked)}
        />
        Refund shipping
      </label>
      <div>
        <label htmlFor="refund-note" className="mb-1 block text-xs text-muted-foreground">
          Reason (optional)
        </label>
        <input
          id="refund-note"
          className={field}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--forest)]"
          checked={notify}
          onChange={(e) => setNotify(e.target.checked)}
        />
        Email the customer
      </label>
      <div className="flex gap-2">
        <Button type="submit" className="h-11" disabled={busy || (lines.length === 0 && !shipping)}>
          {busy ? "Refunding…" : "Issue refund"}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={onClose}>
          Close
        </Button>
      </div>
    </form>
  );
}

const REASONS = [
  ["CUSTOMER", "Customer changed or cancelled"],
  ["INVENTORY", "Items unavailable"],
  ["FRAUD", "Fraudulent order"],
  ["DECLINED", "Payment declined"],
  ["STAFF", "Staff error"],
  ["OTHER", "Other"],
] as const;

function CancelForm({
  busy,
  onSubmit,
  onClose,
}: {
  busy: boolean;
  onSubmit: (body: unknown) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("CUSTOMER");
  const [refund, setRefund] = useState(true);
  const [restock, setRestock] = useState(true);
  const [notify, setNotify] = useState(true);
  const [staffNote, setStaffNote] = useState("");
  const [sure, setSure] = useState(false);
  return (
    <form
      aria-label="Cancel order"
      className="mb-5 space-y-3 rounded-lg bg-background p-4 ring-1 ring-border/60"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sure) return setSure(true);
        onSubmit({ reason, refund, restock, notifyCustomer: notify, staffNote });
      }}
    >
      <div>
        <label htmlFor="cancel-reason" className="mb-1 block text-xs text-muted-foreground">
          Reason
        </label>
        <select
          id="cancel-reason"
          className={field}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {REASONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {(
        [
          ["Refund the payment", refund, setRefund],
          ["Put items back in stock", restock, setRestock],
          ["Email the customer", notify, setNotify],
        ] as const
      ).map(([label, value, set]) => (
        <label key={label} className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--forest)]"
            checked={value}
            onChange={(e) => set(e.target.checked)}
          />
          {label}
        </label>
      ))}
      <div>
        <label htmlFor="cancel-note" className="mb-1 block text-xs text-muted-foreground">
          Internal note (optional)
        </label>
        <input
          id="cancel-note"
          className={field}
          maxLength={300}
          value={staffNote}
          onChange={(e) => setStaffNote(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="submit"
          variant={sure ? "destructive" : "default"}
          className="h-11"
          disabled={busy}
        >
          {busy ? "Cancelling…" : sure ? "Confirm: cancel this order" : "Cancel order"}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={onClose}>
          Keep order
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Cancelling can&apos;t be undone.</p>
    </form>
  );
}

export default function OrderDetail({ numeric }: { numeric: string }) {
  const resource = useApiResource<{ order: Order }>(`/api/admin/orders/${numeric}`);
  if (resource.status === "loading") {
    return (
      <>
        <PageHeader title="Order" />
        <Skeleton variant="form" />
      </>
    );
  }
  if (resource.status === "error") {
    return (
      <>
        <PageHeader title="Order" />
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {resource.httpStatus === 404 ? "This order doesn't exist." : resource.message}{" "}
          <button className="underline" onClick={resource.retry}>
            Try again
          </button>
        </div>
      </>
    );
  }
  return <Detail key={resource.data.order.id} initial={resource.data.order} />;
}
