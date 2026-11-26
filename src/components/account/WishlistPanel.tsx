"use client";

import { Heart } from "lucide-react";
import Link from "next/link";

import ProductCard from "@/components/storefront/ProductCard";
import { useApiResource } from "@/components/account/useApiResource";
import { useRequireAuth } from "@/components/account/useRequireAuth";
import { useAppSelector } from "@/store/hooks";
import type { Product } from "@/lib/types";

/** The customer's saved plants, with live price and stock. */
export default function WishlistPanel() {
  const user = useRequireAuth("/account/wishlist");
  const ready = user !== null;
  // Reloads whenever a heart is toggled elsewhere, so a removed plant leaves the list.
  const saved = useAppSelector((state) => state.wishlist.handles.join(","));
  const result = useApiResource<{ products: Product[] }>(
    ready ? `/api/wishlist/products?v=${encodeURIComponent(saved)}` : null,
  );

  if (!ready || result.status === "loading") {
    return (
      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((key) => (
          <div key={key} className="aspect-[4/5] animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (result.status === "error") {
    return (
      <div className="rounded-2xl bg-card p-6 text-center shadow-sm ring-1 ring-border/60">
        <p className="text-sm text-muted-foreground">{result.message}</p>
        <button
          type="button"
          onClick={result.retry}
          className="mt-4 text-sm font-semibold text-forest underline underline-offset-4"
        >
          Try again
        </button>
      </div>
    );
  }

  const { products } = result.data;
  if (products.length === 0) {
    return (
      <div className="rounded-3xl bg-sage-light/60 p-10 text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-cream text-clay shadow-sm">
          <Heart className="size-7" aria-hidden />
        </span>
        <h2 className="mt-5 font-display text-2xl font-medium text-forest">Nothing saved yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Tap the heart on any plant to keep it here for later.
        </p>
        <Link
          href="/shop"
          className="mt-6 inline-flex h-11 items-center rounded-full bg-forest px-7 text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
        >
          Browse plants
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="mb-5 text-sm text-muted-foreground">
        {products.length} saved {products.length === 1 ? "plant" : "plants"}
      </p>
      <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </>
  );
}
