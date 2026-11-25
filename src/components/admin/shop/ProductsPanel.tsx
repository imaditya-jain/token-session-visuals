"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import PageHeader from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import {
  numericOf,
  PRODUCT_STATUSES,
  STATUS_NAMES,
  type ProductListItem,
  type ProductListPage,
  type ProductStatus,
} from "@/lib/products";
import { useAppSelector } from "@/store/hooks";
import Skeleton from "@/components/admin/Skeleton";

const statusClass: Record<ProductStatus, string> = {
  ACTIVE: "bg-forest text-cream",
  DRAFT: "bg-clay/15 text-clay-deep",
  ARCHIVED: "bg-muted text-muted-foreground",
};

const price = (item: ProductListItem): string => {
  if (item.priceMin === null) return "—";
  const fmt = (amount: string) =>
    new Intl.NumberFormat("en", { style: "currency", currency: item.currency ?? "USD" }).format(
      Number(amount),
    );
  return item.priceMin === item.priceMax || item.priceMax === null
    ? fmt(item.priceMin)
    : `${fmt(item.priceMin)} – ${fmt(item.priceMax)}`;
};

export default function ProductsPanel() {
  const canWrite = useAppSelector(
    (s) => s.admin.access?.permissions.includes("products:write") ?? false,
  );
  const [status, setStatus] = useState<ProductStatus | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [later, setLater] = useState<{ items: ProductListItem[]; cursor: string | null } | null>(
    null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (search) query.set("search", search);
  const first = useApiResource<ProductListPage>(`/api/admin/products?${query.toString()}`);

  const reset = () => setLater(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    reset();
  };

  const loadMore = async (cursor: string) => {
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const next = new URLSearchParams(query);
      next.set("after", cursor);
      const page = await apiFetch<ProductListPage>(`/api/admin/products?${next.toString()}`);
      setLater({ items: [...(later?.items ?? []), ...page.items], cursor: page.nextCursor });
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const items = first.status === "ready" ? [...first.data.items, ...(later?.items ?? [])] : [];
  const cursor = first.status === "ready" ? (later ? later.cursor : first.data.nextCursor) : null;

  return (
    <>
      <PageHeader
        title="Products"
        lead="Your catalogue, live from Shopify. Changes here are saved straight to Shopify."
        action={
          canWrite ? (
            <Button asChild className="h-11">
              <Link href="/admin/shop/products/new">Add product</Link>
            </Button>
          ) : undefined
        }
      />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="product-status" className="mb-1 block text-xs text-muted-foreground">
            Status
          </label>
          <select
            id="product-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ProductStatus | "");
              reset();
            }}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All</option>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_NAMES[s]}
              </option>
            ))}
          </select>
        </div>
        <form onSubmit={submit} role="search" className="ml-auto flex items-end gap-2">
          <div>
            <label htmlFor="product-search" className="mb-1 block text-xs text-muted-foreground">
              Search
            </label>
            <input
              id="product-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Title or SKU"
              className="h-11 w-48 rounded-md border border-input bg-background px-3 text-sm sm:w-64"
            />
          </div>
          <Button type="submit" variant="outline" className="h-11">
            Search
          </Button>
        </form>
      </div>

      {first.status === "loading" ? (
        <Skeleton variant="list" />
      ) : first.status === "error" ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {first.message}{" "}
          <button className="underline" onClick={first.retry}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          {search || status ? "No products match." : "No products yet."}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/admin/shop/products/${numericOf(item.id)}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt=""
                      width={56}
                      height={56}
                      sizes="56px"
                      className="size-14 shrink-0 rounded-md bg-sand object-cover"
                    />
                  ) : (
                    <span aria-hidden className="size-14 shrink-0 rounded-md bg-sand" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[item.productType, item.vendor].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {item.tracksInventory ? `${item.totalInventory ?? 0} in stock` : "Not tracked"}
                    {" · "}
                    {item.variantCount} {item.variantCount === 1 ? "variant" : "variants"}
                  </span>
                  <span className="w-32 text-right text-sm tabular-nums">{price(item)}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass[item.status]}`}
                  >
                    {STATUS_NAMES[item.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {cursor ? (
            <div className="mt-6 text-center">
              <Button
                variant="outline"
                className="h-11"
                disabled={loadingMore}
                onClick={() => void loadMore(cursor)}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
              {moreFailed ? (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  Couldn&apos;t load more. Try again.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
