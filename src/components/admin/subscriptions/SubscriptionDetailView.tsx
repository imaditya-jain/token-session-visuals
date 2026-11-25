"use client";

import Link from "next/link";
import { useState } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import PageHeader from "@/components/admin/PageHeader";
import Skeleton from "@/components/admin/Skeleton";
import StatusPill from "@/components/admin/StatusPill";
import {
  NotConnected,
  subscriptionTone,
} from "@/components/admin/subscriptions/SubscriptionsPanel";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { formatDateTime, formatMoney, statusLabel } from "@/lib/order-format";
import type { SubscriptionAction, SubscriptionDetail } from "@/lib/subscriptions";
import { useAppSelector } from "@/store/hooks";

function View({ initial }: { initial: SubscriptionDetail }) {
  const canWrite = useAppSelector(
    (s) => s.admin.access?.permissions.includes("subscriptions:write") ?? false,
  );
  const [sub, setSub] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const act = async (action: SubscriptionAction) => {
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<{ subscription: SubscriptionDetail }>(
        `/api/admin/subscriptions/${sub.id}`,
        {
          method: "PUT",
          json: { action },
        },
      );
      setSub(data.subscription);
      setConfirmCancel(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Network problem.");
    } finally {
      setBusy(false);
    }
  };

  const card = "rounded-xl bg-card p-5 ring-1 ring-border/60";
  return (
    <>
      <PageHeader
        title={sub.customerName}
        lead={`${sub.email} · started ${sub.startedAt ? formatDateTime(sub.startedAt) : "—"}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill label={statusLabel(sub.status)} tone={subscriptionTone(sub.status)} />
            <Button asChild variant="outline" className="h-11">
              <Link href="/admin/subscriptions">All subscriptions</Link>
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <section className={card}>
            <h2 className="mb-3 font-display text-lg text-forest">Plan</h2>
            <ul className="divide-y divide-border text-sm">
              {sub.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-3 py-2">
                  <span>
                    {l.title} × {l.quantity}
                    <span className="block text-xs text-muted-foreground">{l.plan}</span>
                  </span>
                  <span className="tabular-nums">{l.price}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Billed every {sub.interval.replace(/^1 /, "")} ·{" "}
              {sub.total
                ? formatMoney({ amount: sub.total, currency: sub.currency || "USD" })
                : "—"}{" "}
              per charge
              {sub.nextBilling ? ` · next ${formatDateTime(sub.nextBilling)}` : ""}
            </p>
            {canWrite && sub.status !== "CANCELLED" && sub.status !== "EXPIRED" ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {sub.status === "ACTIVE" ? (
                  <Button
                    variant="outline"
                    className="h-11"
                    disabled={busy}
                    onClick={() => void act("pause")}
                  >
                    Pause
                  </Button>
                ) : null}
                {sub.status === "PAUSED" ? (
                  <Button
                    variant="outline"
                    className="h-11"
                    disabled={busy}
                    onClick={() => void act("resume")}
                  >
                    Resume
                  </Button>
                ) : null}
                {confirmCancel ? (
                  <Button
                    variant="destructive"
                    className="h-11"
                    disabled={busy}
                    onClick={() => void act("cancel")}
                  >
                    Confirm: cancel subscription
                  </Button>
                ) : (
                  <Button variant="outline" className="h-11" onClick={() => setConfirmCancel(true)}>
                    Cancel subscription
                  </Button>
                )}
              </div>
            ) : null}
          </section>
          <section className={card}>
            <h2 className="mb-3 font-display text-lg text-forest">Billing history</h2>
            {sub.billing.length === 0 ? (
              <p className="text-sm text-muted-foreground">No charges yet.</p>
            ) : (
              <ul aria-label="Billing attempts" className="divide-y divide-border text-sm">
                {sub.billing.map((b) => (
                  <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>{formatDateTime(b.date)}</span>
                    <span className="text-muted-foreground">
                      {b.completedAt
                        ? `Charged ${formatDateTime(b.completedAt)}`
                        : b.status || "Scheduled"}
                      {b.error ? ` · ${b.error}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {sub.log.length > 0 ? (
            <section className={card}>
              <h2 className="mb-3 font-display text-lg text-forest">Activity</h2>
              <ol
                aria-label="Subscription activity"
                className="space-y-2 border-l border-border pl-4 text-sm"
              >
                {sub.log.map((l, i) => (
                  <li key={i}>
                    {l.content}
                    <span className="block text-xs text-muted-foreground">{l.created}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
        <aside aria-label="Subscription details" className="space-y-6">
          <section className={card}>
            <h2 className="mb-3 font-display text-lg text-forest">Delivery address</h2>
            <address className="space-y-0.5 text-sm not-italic">
              {sub.shippingAddress.length ? (
                sub.shippingAddress.map((l, i) => <p key={i}>{l}</p>)
              ) : (
                <p className="text-muted-foreground">None</p>
              )}
            </address>
          </section>
          {sub.orderId ? (
            <section className={card}>
              <h2 className="mb-3 font-display text-lg text-forest">First order</h2>
              <Link className="text-sm underline" href={`/admin/orders/${sub.orderId}`}>
                View order
              </Link>
            </section>
          ) : null}
        </aside>
      </div>
    </>
  );
}

export default function SubscriptionDetailView({ id }: { id: string }) {
  const resource = useApiResource<{ subscription: SubscriptionDetail }>(
    `/api/admin/subscriptions/${id}`,
  );
  if (resource.status === "loading") {
    return (
      <>
        <PageHeader title="Subscription" />
        <Skeleton variant="form" />
      </>
    );
  }
  if (resource.status === "error") {
    return (
      <>
        <PageHeader title="Subscription" />
        {resource.code === "seal_not_configured" || resource.code === "seal_rejected" ? (
          <NotConnected message={resource.message} />
        ) : (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {resource.httpStatus === 404 ? "This subscription doesn't exist." : resource.message}{" "}
            <button className="underline" onClick={resource.retry}>
              Try again
            </button>
          </div>
        )}
      </>
    );
  }
  return <View key={resource.data.subscription.id} initial={resource.data.subscription} />;
}
