"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import FilterPopover from "@/components/storefront/FilterPopover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  activeFilterCount,
  resetPaging,
  shopHref,
  SORT_KEYS,
  SORT_LABELS,
  type ShopQuery,
  type SortKey,
} from "@/lib/shop";

const parsePrice = (value: string): number | undefined => {
  if (value.trim() === "") return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
};

/**
 * Filter and sort bar for the shop. State lives in the URL (server-rendered results, shareable and
 * cursor-pagination friendly); any change returns to the first page.
 */
export default function ShopToolbar({ query, types }: { query: ShopQuery; types: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Local drafts keep typing smooth; they are cleared once committed so the URL is the source of truth.
  const [draft, setDraft] = useState<{ min?: string; max?: string }>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const minValue = draft.min ?? query.min?.toString() ?? "";
  const maxValue = draft.max ?? query.max?.toString() ?? "";

  const navigate = (patch: Partial<ShopQuery>) => {
    startTransition(() =>
      router.push(shopHref(resetPaging({ ...query, ...patch })), { scroll: false }),
    );
  };

  const commitPrice = (rawMin: string, rawMax: string) => {
    clearTimeout(timer.current);
    const nextMin = parsePrice(rawMin);
    const nextMax = parsePrice(rawMax);
    setDraft({});
    if (nextMin === query.min && nextMax === query.max) return;
    const next: ShopQuery = { ...query };
    if (nextMin === undefined) delete next.min;
    else next.min = nextMin;
    if (nextMax === undefined) delete next.max;
    else next.max = nextMax;
    navigate(next);
  };

  /** Debounced so typing "40" doesn't navigate on "4"; Enter commits immediately. */
  const editPrice = (field: "min" | "max", value: string) => {
    const nextDraft = { ...draft, [field]: value };
    setDraft(nextDraft);
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => commitPrice(nextDraft.min ?? minValue, nextDraft.max ?? maxValue),
      700,
    );
  };

  const toggleType = (type: string, checked: boolean) =>
    navigate({ types: checked ? [...query.types, type] : query.types.filter((t) => t !== type) });

  const activeCount = activeFilterCount(query);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5"
      aria-busy={pending}
    >
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="text-sm font-semibold text-foreground">Filter:</span>

        <FilterPopover
          label="Availability"
          activeCount={Number(query.inStock) + Number(query.outOfStock)}
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Availability
          </p>
          <label className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
            <Checkbox
              checked={query.inStock}
              onCheckedChange={(value) => navigate({ inStock: value === true })}
            />
            In stock
          </label>
          <label className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
            <Checkbox
              checked={query.outOfStock}
              onCheckedChange={(value) => navigate({ outOfStock: value === true })}
            />
            Out of stock
          </label>
        </FilterPopover>

        <FilterPopover
          label="Price"
          activeCount={Number(query.min !== undefined) + Number(query.max !== undefined)}
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Price
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              commitPrice(minValue, maxValue);
            }}
            className="flex items-center gap-2"
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="From"
              aria-label="Minimum price"
              value={minValue}
              onChange={(event) => editPrice("min", event.target.value)}
              className="h-9 rounded-md"
            />
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="To"
              aria-label="Maximum price"
              value={maxValue}
              onChange={(event) => editPrice("max", event.target.value)}
              className="h-9 rounded-md"
            />
            <button type="submit" className="sr-only">
              Apply price filter
            </button>
          </form>
        </FilterPopover>

        {types.length > 1 && (
          <FilterPopover label="Product type" activeCount={query.types.length}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Product type
            </p>
            {types.map((type) => (
              <label key={type} className="flex cursor-pointer items-center gap-3 py-1.5 text-sm">
                <Checkbox
                  checked={query.types.includes(type)}
                  onCheckedChange={(value) => toggleType(type, value === true)}
                />
                {type}
              </label>
            ))}
          </FilterPopover>
        )}

        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => {
              clearTimeout(timer.current);
              setDraft({});
              startTransition(() => router.push(shopHref({ sort: query.sort }), { scroll: false }));
            }}
            className="flex items-center gap-1 text-sm font-medium text-clay transition-colors hover:text-clay/80"
          >
            <X className="size-3.5" aria-hidden /> Clear all
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">Sort by:</span>
        <Select value={query.sort} onValueChange={(value) => navigate({ sort: value as SortKey })}>
          <SelectTrigger className="w-[220px] rounded-md border-border bg-card hover:border-forest hover:text-forest">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-border">
            {SORT_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
