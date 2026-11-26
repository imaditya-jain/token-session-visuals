"use client";

import { useState } from "react";

import ProductCard from "@/components/storefront/ProductCard";
import { OCCASIONS } from "@/lib/gift";
import type { Product } from "@/lib/types";

/** The bouquets, with chips to narrow them by occasion. Only occasions that have a bouquet are offered. */
export default function BouquetBrowser({
  products,
  empty,
}: {
  products: Product[];
  empty: string;
}) {
  const [occasion, setOccasion] = useState<string | null>(null);
  const available = OCCASIONS.filter((o) => products.some((p) => p.occasions?.includes(o.id)));
  const shown = occasion ? products.filter((p) => p.occasions?.includes(occasion)) : products;

  if (products.length === 0) {
    return (
      <p className="mx-auto max-w-md rounded-2xl bg-sage-light/60 p-8 text-center text-muted-foreground">
        {empty}
      </p>
    );
  }

  return (
    <div>
      {available.length > 0 ? (
        <div
          role="group"
          aria-label="Shop by occasion"
          className="mb-8 flex flex-wrap justify-center gap-2"
        >
          {[{ id: null, label: "All" }, ...available].map((chip) => {
            const active = chip.id === occasion;
            return (
              <button
                key={chip.id ?? "all"}
                type="button"
                aria-pressed={active}
                onClick={() => setOccasion(chip.id)}
                className={`min-h-11 rounded-full px-5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-forest text-cream shadow-md"
                    : "bg-card text-forest ring-1 ring-border/70 hover:bg-sage-light"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        {shown.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </div>
  );
}
