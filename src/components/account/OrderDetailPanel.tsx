"use client";

import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import OrderProgress from "@/components/account/OrderProgress";
import StatusBadges from "@/components/account/StatusBadges";
import { useApiResource } from "@/components/account/useApiResource";
import { useRequireAuth } from "@/components/account/useRequireAuth";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import type { OrderDetail } from "@/lib/orders";

const card = "rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8";
const back = (
  <Link
    href="/account/orders"
    className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-forest underline-offset-4 hover:text-clay hover:underline"
  >
    <ArrowLeft className="size-4" aria-hidden /> All orders
  </Link>
);

/** Only https tracking links are rendered as links. */
const safeUrl = (url: string | undefined) => (url?.startsWith("https://") ? url : undefined);

export default function OrderDetailPanel({ id }: { id: string }) {
  const user = useRequireAuth(`/account/orders/${id}`);
  const resource = useApiResource<{ order: OrderDetail }>(
    user ? `/api/orders/${encodeURIComponent(id)}` : null,
  );

  if (!user || resource.status === "loading") {
    return (
      <div
        className={`${card} animate-pulse space-y-4`}
        aria-busy="true"
        aria-label="Loading order"
      >
        <div className="h-6 w-1/3 rounded bg-muted" />
        <div className="h-24 rounded bg-muted" />
      </div>
    );
  }

  if (resource.status === "error") {
    const notFound = resource.httpStatus === 404;
    const unverified = resource.code === "email_unverified";
    return (
      <div className={`${card} text-center`}>
        <h2 className="font-display text-2xl font-medium text-forest">
          {notFound
            ? "We couldn't find that order"
            : unverified
              ? "Confirm your email to see this order"
              : "We couldn't load this order"}
        </h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          {notFound ? "It may belong to a different account." : resource.message}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild variant="outline" className="h-11 px-7">
            <Link href={unverified ? "/account" : "/account/orders"}>
              {unverified ? "Go to my account" : "Back to orders"}
            </Link>
          </Button>
          {!notFound && !unverified ? (
            <Button onClick={resource.retry} className="h-11 px-7">
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const { order } = resource.data;
  const address = order.shippingAddress;

  return (
    <div className="space-y-6">
      {back}
      <section className={card} aria-labelledby="order-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="order-heading" className="font-display text-3xl font-medium text-forest">
              Order {order.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Placed {formatDate(order.processedAt)}
            </p>
          </div>
          <StatusBadges order={order} />
        </div>
        <OrderProgress order={order} />

        <ul className="mt-8 divide-y divide-border">
          {order.lines.map((line, index) => (
            <li key={`${line.title}-${index}`} className="flex items-center gap-4 py-4">
              {line.image ? (
                <Image
                  src={line.image}
                  alt=""
                  width={72}
                  height={72}
                  sizes="72px"
                  className="size-18 shrink-0 rounded-md bg-sand object-cover"
                />
              ) : (
                <div className="size-18 shrink-0 rounded-md bg-sand" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{line.title}</p>
                {line.variantTitle ? (
                  <p className="text-sm text-muted-foreground">{line.variantTitle}</p>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  {line.quantity} × {formatMoney(line.unitPrice)}
                </p>
              </div>
              <p className="font-semibold text-forest">
                {formatMoney({
                  ...line.unitPrice,
                  amount: String(Number(line.unitPrice.amount) * line.quantity),
                })}
              </p>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          {[
            ["Subtotal", order.subtotal],
            ["Shipping", order.shipping],
            ["Tax", order.tax],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between">
              <dt className="text-muted-foreground">{String(label)}</dt>
              <dd>{formatMoney(value as OrderDetail["subtotal"])}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-3 text-base font-semibold text-forest">
            <dt>Total</dt>
            <dd>{formatMoney(order.total)}</dd>
          </div>
        </dl>
      </section>

      {address || order.tracking.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {address ? (
            <section className={card} aria-labelledby="ship-heading">
              <h3 id="ship-heading" className="font-display text-xl font-medium text-forest">
                Shipping to
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {[address.city, address.region, address.country].filter(Boolean).join(", ")}
              </p>
            </section>
          ) : null}
          {order.tracking.length > 0 ? (
            <section className={card} aria-labelledby="track-heading">
              <h3 id="track-heading" className="font-display text-xl font-medium text-forest">
                Tracking
              </h3>
              <ul className="mt-2 space-y-2 text-sm">
                {order.tracking.map((entry, index) => {
                  const href = safeUrl(entry.url);
                  const label =
                    [entry.company, entry.number].filter(Boolean).join(" · ") || "Track package";
                  return (
                    <li key={index}>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-forest underline-offset-4 hover:text-clay hover:underline"
                        >
                          {label}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{label}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
