"use client";

import {
  INVENTORY_POLICIES,
  WEIGHT_UNITS,
  type VariantInput,
  type VariantView,
} from "@/lib/products";
import { patchAt } from "@/lib/array-edit";

const field =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const POLICY_LABEL = {
  DENY: "Stop selling when out of stock",
  CONTINUE: "Keep selling when out of stock",
} as const;
const UNIT_LABEL = { GRAMS: "g", KILOGRAMS: "kg", OUNCES: "oz", POUNDS: "lb" } as const;

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * One card per variant: price, compare-at price, cost, SKU, barcode, weight, tax, and inventory behaviour. Money is
 * typed as text and sent as an exact decimal string (never converted to a float). Existing variants show their
 * current stock, which is changed on the Inventory page.
 */
export default function VariantsEditor({
  variants,
  onChange,
  optionNames,
  currency,
  current,
}: {
  variants: VariantInput[];
  onChange: (next: VariantInput[]) => void;
  optionNames: string[];
  currency: string;
  /** The saved variants, to show live stock next to the matching card. */
  current?: VariantView[];
}) {
  return (
    <ul aria-label="Variants" className="space-y-4">
      {variants.map((variant, index) => {
        const set = (patch: Partial<VariantInput>) => onChange(patchAt(variants, index, patch));
        const id = `variant-${index}`;
        const label = variant.optionValues.length ? variant.optionValues.join(" / ") : "Default";
        const saved = current?.find((c) => c.id === variant.id);
        const stock = saved?.levels.reduce((sum, level) => sum + level.quantities.available, 0);
        return (
          <li
            key={variant.id ?? `new-${variant.optionValues.join("|")}-${index}`}
            className="rounded-xl bg-card p-4 ring-1 ring-border/60"
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg text-forest">
                {label}
                {!variant.id ? (
                  <span className="ml-2 rounded-full bg-sage-light px-2 py-0.5 font-sans text-xs text-forest">
                    New
                  </span>
                ) : null}
              </h3>
              {saved ? (
                <p className="text-sm text-muted-foreground">
                  {saved.trackInventory ? `${stock} in stock` : "Stock not tracked"}
                </p>
              ) : null}
            </div>
            {optionNames.length > 0 ? (
              <p className="mb-3 text-xs text-muted-foreground">
                {optionNames
                  .map((name, i) => `${name}: ${variant.optionValues[i] ?? ""}`)
                  .join(" · ")}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field id={`${id}-price`} label={`Price (${currency})`}>
                <input
                  id={`${id}-price`}
                  className={field}
                  inputMode="decimal"
                  value={variant.price}
                  onChange={(e) => set({ price: e.target.value })}
                />
              </Field>
              <Field id={`${id}-compare`} label="Compare-at price">
                <input
                  id={`${id}-compare`}
                  className={field}
                  inputMode="decimal"
                  value={variant.compareAtPrice ?? ""}
                  onChange={(e) =>
                    set({ compareAtPrice: e.target.value === "" ? null : e.target.value })
                  }
                />
              </Field>
              <Field id={`${id}-cost`} label="Cost per item">
                <input
                  id={`${id}-cost`}
                  className={field}
                  inputMode="decimal"
                  value={variant.costPerItem ?? ""}
                  onChange={(e) =>
                    set({ costPerItem: e.target.value === "" ? null : e.target.value })
                  }
                />
              </Field>
              <Field id={`${id}-sku`} label="SKU">
                <input
                  id={`${id}-sku`}
                  className={field}
                  value={variant.sku}
                  onChange={(e) => set({ sku: e.target.value })}
                />
              </Field>
              <Field id={`${id}-barcode`} label="Barcode">
                <input
                  id={`${id}-barcode`}
                  className={field}
                  value={variant.barcode}
                  onChange={(e) => set({ barcode: e.target.value })}
                />
              </Field>
              <Field id={`${id}-weight`} label="Weight">
                <div className="flex gap-2">
                  <input
                    id={`${id}-weight`}
                    className={field}
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={variant.weight?.value ?? ""}
                    onChange={(e) =>
                      set({
                        weight:
                          e.target.value === ""
                            ? null
                            : {
                                value: Number(e.target.value),
                                unit: variant.weight?.unit ?? "KILOGRAMS",
                              },
                      })
                    }
                  />
                  <label htmlFor={`${id}-unit`} className="sr-only">
                    Weight unit
                  </label>
                  <select
                    id={`${id}-unit`}
                    className={`${field} w-24`}
                    value={variant.weight?.unit ?? "KILOGRAMS"}
                    disabled={!variant.weight}
                    onChange={(e) =>
                      variant.weight &&
                      set({
                        weight: {
                          value: variant.weight.value,
                          unit: e.target.value as (typeof WEIGHT_UNITS)[number],
                        },
                      })
                    }
                  >
                    {WEIGHT_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {UNIT_LABEL[unit]}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
              <Field id={`${id}-policy`} label="When out of stock">
                <select
                  id={`${id}-policy`}
                  className={field}
                  value={variant.inventoryPolicy}
                  onChange={(e) =>
                    set({ inventoryPolicy: e.target.value as (typeof INVENTORY_POLICIES)[number] })
                  }
                >
                  {INVENTORY_POLICIES.map((policy) => (
                    <option key={policy} value={policy}>
                      {POLICY_LABEL[policy]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
              {(
                [
                  ["trackInventory", "Track inventory"],
                  ["taxable", "Charge tax"],
                  ["requiresShipping", "Needs shipping"],
                ] as const
              ).map(([key, text]) => (
                <label key={key} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--forest)]"
                    checked={variant[key]}
                    onChange={(e) => set({ [key]: e.target.checked } as Partial<VariantInput>)}
                  />
                  {text}
                  <span className="sr-only"> for {label}</span>
                </label>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
