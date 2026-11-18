"use client";

import { useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";

import ProductCard from "@/components/storefront/ProductCard";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Product } from "@/lib/types";

type SortKey =
  "featured" | "best-selling" | "alpha-asc" | "alpha-desc" | "price-asc" | "price-desc";

const SORT_LABELS: Record<SortKey, string> = {
  featured: "Featured",
  "best-selling": "Best selling",
  "alpha-asc": "Alphabetically, A-Z",
  "alpha-desc": "Alphabetically, Z-A",
  "price-asc": "Price, low to high",
  "price-desc": "Price, high to low",
};

function sortProducts(list: Product[], sort: SortKey): Product[] {
  const copy = [...list];
  switch (sort) {
    case "best-selling":
      return copy.sort(
        (a, b) => Number(b.badge === "Bestseller") - Number(a.badge === "Bestseller"),
      );
    case "alpha-asc":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "alpha-desc":
      return copy.sort((a, b) => b.name.localeCompare(a.name));
    case "price-asc":
      return copy.sort((a, b) => a.price - b.price);
    case "price-desc":
      return copy.sort((a, b) => b.price - a.price);
    default:
      return copy;
  }
}

function FilterPopover({
  label,
  activeCount,
  children,
}: {
  label: string;
  activeCount: number;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-forest hover:text-forest data-[state=open]:border-forest data-[state=open]:text-forest">
          {label}
          {activeCount > 0 && (
            <span className="rounded-full bg-clay px-1.5 text-[11px] font-bold text-cream">
              {activeCount}
            </span>
          )}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-xl border-border bg-card p-5">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export default function CollectionProducts({ products: allProducts }: { products: Product[] }) {
  const [inStockOnly, setInStockOnly] = useState(false);
  const [outOfStockOnly, setOutOfStockOnly] = useState(false);
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");
  const [sort, setSort] = useState<SortKey>("featured");

  const inStockCount = allProducts.filter((p) => p.inStock).length;
  const outOfStockCount = allProducts.length - inStockCount;

  const activeFilterCount =
    Number(inStockOnly) + Number(outOfStockOnly) + Number(!!priceFrom) + Number(!!priceTo);

  const clearFilters = () => {
    setInStockOnly(false);
    setOutOfStockOnly(false);
    setPriceFrom("");
    setPriceTo("");
  };

  const filtered = useMemo(() => {
    let list = allProducts;
    if (inStockOnly && !outOfStockOnly) list = list.filter((p) => p.inStock);
    if (outOfStockOnly && !inStockOnly) list = list.filter((p) => !p.inStock);
    const from = parseFloat(priceFrom);
    const to = parseFloat(priceTo);
    if (!Number.isNaN(from)) list = list.filter((p) => p.price >= from);
    if (!Number.isNaN(to)) list = list.filter((p) => p.price <= to);
    return sortProducts(list, sort);
  }, [allProducts, inStockOnly, outOfStockOnly, priceFrom, priceTo, sort]);

  return (
    <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-sm font-semibold text-foreground">Filter:</span>
          <FilterPopover
            label="Availability"
            activeCount={Number(inStockOnly) + Number(outOfStockOnly)}
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Availability
            </p>
            <label className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
              <Checkbox checked={inStockOnly} onCheckedChange={(v) => setInStockOnly(v === true)} />
              In stock ({inStockCount})
            </label>
            <label className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
              <Checkbox
                checked={outOfStockOnly}
                onCheckedChange={(v) => setOutOfStockOnly(v === true)}
              />
              Out of stock ({outOfStockCount})
            </label>
          </FilterPopover>

          <FilterPopover label="Price" activeCount={Number(!!priceFrom) + Number(!!priceTo)}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Price
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              The highest price in this collection is{" "}
              {Math.max(...allProducts.map((p) => p.price)).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                minimumFractionDigits: 0,
              })}
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                placeholder="From"
                value={priceFrom}
                onChange={(e) => setPriceFrom(e.target.value)}
                className="h-9 rounded-md"
              />
              <Input
                type="number"
                min={0}
                placeholder="To"
                value={priceTo}
                onChange={(e) => setPriceTo(e.target.value)}
                className="h-9 rounded-md"
              />
            </div>
          </FilterPopover>

          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-sm font-medium text-clay transition-colors hover:text-clay/80"
            >
              <X className="size-3.5" aria-hidden /> Clear all
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Sort by:</span>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-[220px] rounded-md border-border bg-card hover:border-forest hover:text-forest">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SORT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="py-5 text-sm font-medium text-foreground">
        {filtered.length} {filtered.length === 1 ? "product" : "products"}
      </p>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 pb-16 sm:gap-6 lg:grid-cols-4 lg:pb-24">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="font-display text-xl text-foreground">No products match your filters</p>
          <p className="text-sm text-muted-foreground">
            Try widening the price range or clearing availability.
          </p>
          <Button variant="outline" onClick={clearFilters} className="mt-2">
            Clear all filters
          </Button>
        </div>
      )}
    </section>
  );
}
