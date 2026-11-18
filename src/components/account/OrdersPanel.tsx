"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useApiResource } from "@/components/account/useApiResource";
import StatusBadges from "@/components/account/StatusBadges";
import { useRequireAuth } from "@/components/account/useRequireAuth";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/format";
import type { OrderPage } from "@/lib/orders";

const card = "rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8";
const control =
  "inline-flex min-h-11 items-center gap-2 rounded-md border px-5 py-3 text-sm font-semibold transition-colors sm:px-7";
const enabled = `${control} border-forest bg-transparent text-forest hover:bg-forest hover:text-cream`;
const disabled = `${control} cursor-not-allowed border-border text-muted-foreground/60`;

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your orders">
      {[0, 1, 2].map((key) => (
        <div key={key} className={`${card} animate-pulse space-y-3`}>
          <div className="h-5 w-1/3 rounded bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${card} text-center`}>
      <h2 className="font-display text-2xl font-medium text-forest">{title}</h2>
      <div className="mx-auto mt-3 max-w-md space-y-4 text-sm text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

export default function OrdersPanel() {
  const user = useRequireAuth("/account/orders");
  const params = useSearchParams();
  const after = params.get("after");
  const before = params.get("before");
  const pageNumber = Math.max(1, Number(params.get("page")) || 1);

  const query = new URLSearchParams();
  if (after) query.set("after", after);
  else if (before) query.set("before", before);
  const resource = useApiResource<OrderPage>(
    user ? `/api/orders${query.size ? `?${query}` : ""}` : null,
  );

  if (!user || resource.status === "loading") return <Skeleton />;

  if (resource.status === "error") {
    if (resource.code === "email_unverified") {
      return (
        <Message title="Confirm your email to see your orders">
          <p>For your security, order history is available once your email address is confirmed.</p>
          <Button asChild className="h-11 px-7 text-sm font-semibold">
            <Link href="/account">Go to my account</Link>
          </Button>
        </Message>
      );
    }
    return (
      <Message title="We couldn't load your orders">
        <p>{resource.message}</p>
        <Button
          variant="outline"
          onClick={resource.retry}
          className="h-11 px-7 text-sm font-semibold"
        >
          Try again
        </Button>
      </Message>
    );
  }

  const { orders, pageInfo } = resource.data;

  if (orders.length === 0 && !after && !before) {
    return (
      <Message title="No orders yet">
        <p>When you place an order it will appear here, with tracking once it ships.</p>
        <Button asChild className="h-11 px-7 text-sm font-semibold">
          <Link href="/shop">Start shopping</Link>
        </Button>
      </Message>
    );
  }

  const previous =
    pageInfo.hasPreviousPage && pageInfo.startCursor
      ? `/account/orders?before=${encodeURIComponent(pageInfo.startCursor)}&page=${Math.max(1, pageNumber - 1)}`
      : null;
  const next =
    pageInfo.hasNextPage && pageInfo.endCursor
      ? `/account/orders?after=${encodeURIComponent(pageInfo.endCursor)}&page=${pageNumber + 1}`
      : null;

  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {orders.map((order) => (
          <li key={order.id} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-medium text-forest">
                  Order {order.name}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Placed {formatDate(order.processedAt)} · {order.itemCount}{" "}
                  {order.itemCount === 1 ? "item" : "items"}
                </p>
              </div>
              <p className="text-lg font-semibold text-forest">{formatMoney(order.total)}</p>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {order.previewImages.length > 0 ? (
                  <div className="flex -space-x-3">
                    {order.previewImages.map((src) => (
                      <Image
                        key={src}
                        src={src}
                        alt=""
                        width={56}
                        height={56}
                        sizes="56px"
                        className="size-14 rounded-md border-2 border-card bg-sand object-cover"
                      />
                    ))}
                  </div>
                ) : null}
                <StatusBadges order={order} />
              </div>
              <Button asChild variant="outline" className="h-11 px-6">
                <Link href={`/account/orders/${order.id}`} aria-label={`View order ${order.name}`}>
                  View order
                </Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {previous || next ? (
        <nav
          aria-label="Orders pagination"
          className="flex items-center justify-center gap-3 pt-4 sm:gap-6"
        >
          {previous ? (
            <Link href={previous} rel="prev" className={enabled}>
              <ChevronLeft className="size-4" aria-hidden /> Previous
            </Link>
          ) : (
            <span aria-disabled="true" className={disabled}>
              <ChevronLeft className="size-4" aria-hidden /> Previous
            </span>
          )}
          <span className="text-sm font-medium text-muted-foreground">Page {pageNumber}</span>
          {next ? (
            <Link href={next} rel="next" className={enabled}>
              Next <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span aria-disabled="true" className={disabled}>
              Next <ChevronRight className="size-4" aria-hidden />
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
