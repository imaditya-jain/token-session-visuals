import { Check } from "lucide-react";

import { formatPrice } from "@/lib/format";
import type { GardenerService } from "@/lib/gardener";

export const ONE_TIME = "one-time";

const toCents = (amount: string) => Math.round(Number(amount) * 100);

export type PlanOption = {
  value: string;
  label: string;
  price: string;
  note: string;
  saving: string | null;
  popular: boolean;
};

/** One-time visit plus every subscription plan, priced per visit, with the saving worked out from real prices. */
export function planOptions(service: GardenerService, popular: string): PlanOption[] {
  const single = toCents(service.oneTimePrice);
  const highlight = popular.trim().toLowerCase();
  return [
    {
      value: ONE_TIME,
      label: "One-time visit",
      price: service.oneTimePrice,
      note: "Pay once, no commitment",
      saving: null,
      popular: false,
    },
    ...service.plans.map((plan) => {
      const cents = toCents(plan.price);
      const percent = single > 0 ? Math.round(((single - cents) / single) * 100) : 0;
      return {
        value: plan.id,
        label: plan.name,
        price: plan.price,
        note: "Charged each visit",
        saving: cents < single && percent > 0 ? `Save ${percent}%` : null,
        popular: highlight !== "" && plan.name.toLowerCase().includes(highlight),
      };
    }),
  ];
}

/** Plan cards. The highlighted plan is the only dark card, so there is exactly one focal point. */
export default function PlanPicker({
  options,
  value,
  onChange,
  included,
}: {
  options: PlanOption[];
  value: string;
  onChange: (value: string) => void;
  included: string[];
}) {
  return (
    <fieldset>
      <legend className="sr-only">Choose your plan</legend>
      <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {options.map((option) => {
          const selected = value === option.value;
          const dark = option.popular;
          return (
            <label
              key={option.value}
              className={`group relative flex cursor-pointer flex-col rounded-3xl p-6 transition-all duration-300 ease-out has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/50 sm:p-7 ${
                dark
                  ? "bg-forest text-cream shadow-xl lg:-my-3 lg:py-10"
                  : "bg-card text-foreground shadow-sm ring-1 ring-border/60 hover:-translate-y-1 hover:shadow-lg"
              } ${selected ? "outline outline-[3px] outline-offset-2 outline-clay" : ""}`}
            >
              {dark && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-clay px-4 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-cream shadow-md">
                  Most popular
                </span>
              )}
              <input
                type="radio"
                name="plan"
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-3">
                <span
                  className={`font-display text-xl font-medium ${dark ? "text-cream" : "text-forest"}`}
                >
                  {option.label}
                </span>
                <span
                  aria-hidden
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border transition-all ${
                    selected
                      ? "scale-110 border-clay bg-clay text-cream"
                      : dark
                        ? "border-cream/40 text-transparent"
                        : "border-border text-transparent"
                  }`}
                >
                  <Check className="size-3.5" />
                </span>
              </span>
              <span className="mt-6 flex items-baseline gap-1.5">
                <span
                  className={`font-display text-5xl font-medium tracking-tight ${dark ? "text-cream" : "text-forest"}`}
                >
                  {formatPrice(Number(option.price))}
                </span>
                <span className={`text-sm ${dark ? "text-cream/75" : "text-muted-foreground"}`}>
                  / visit
                </span>
              </span>
              <span className={`mt-2 text-sm ${dark ? "text-cream/75" : "text-muted-foreground"}`}>
                {option.note}
              </span>
              <span className="mt-4 min-h-7">
                {option.saving && (
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      dark ? "bg-cream/15 text-cream" : "bg-sage-light text-forest"
                    }`}
                  >
                    {option.saving} per visit
                  </span>
                )}
              </span>
              {included.length > 0 && (
                <ul
                  className={`mt-5 space-y-2.5 border-t pt-5 text-sm ${
                    dark ? "border-cream/20 text-cream/90" : "border-border/70 text-foreground/85"
                  }`}
                >
                  {included.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Check
                        className={`mt-0.5 size-4 shrink-0 ${dark ? "text-sage" : "text-clay"}`}
                        aria-hidden
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
