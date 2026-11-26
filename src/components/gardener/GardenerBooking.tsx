"use client";

import { useId, useState, type FormEvent } from "react";

import FormAlert from "@/components/auth/FormAlert";
import TextField from "@/components/auth/TextField";
import {
  fieldErrorsFromFailure,
  fieldErrorsFromZod,
  type FieldErrors,
} from "@/components/auth/useFormErrors";
import { formatPrice } from "@/lib/format";
import PlanPicker, { ONE_TIME, planOptions } from "@/components/gardener/PlanPicker";
import { Button } from "@/components/ui/button";
import type { ApiFailure } from "@/features/auth/types";
import { setCartOpen } from "@/features/cart/cartSlice";
import { addToCart } from "@/features/cart/cartThunks";
import type { GardenerService } from "@/lib/gardener";
import { bookingSchema, GARDENER_CITIES } from "@/lib/gardener-schemas";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

/** Today as YYYY-MM-DD in the visitor's own calendar, for the date picker's minimum. */
const today = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

export default function GardenerBooking({
  service,
  included,
  popular,
}: {
  service: GardenerService;
  included: string[];
  popular: string;
}) {
  const dispatch = useAppDispatch();
  const busy = useAppSelector((state) => state.cart.busy);
  const cityId = useId();
  const notesId = useId();
  const [plan, setPlan] = useState<string>(ONE_TIME);
  const marketingId = useId();
  const [acceptsMarketing, setAcceptsMarketing] = useState(false);
  const [values, setValues] = useState({
    name: "",
    email: "",
    city: "",
    address: "",
    date: "",
    phone: "",
    notes: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const parsed = bookingSchema.safeParse({
      ...values,
      acceptsMarketing,
      notes: values.notes || undefined,
    });
    if (!parsed.success) return setErrors(fieldErrorsFromZod(parsed.error));
    setErrors({});
    const added = await dispatch(
      addToCart({
        variantId: service.variantId,
        booking: parsed.data,
        ...(plan === ONE_TIME ? {} : { sellingPlanId: plan }),
      }),
    ).unwrap();
    if (added) {
      dispatch(setCartOpen(true));
      return;
    }
    const failed: ApiFailure = {
      status: 0,
      code: "booking_failed",
      message: "We couldn't add your booking to the cart. Please try again.",
    };
    setErrors(fieldErrorsFromFailure(failed));
    setFailure(failed);
  };

  const options = planOptions(service, popular);
  const chosen = options.find((option) => option.value === plan) ?? options[0];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-10" aria-busy={busy}>
      <FormAlert failure={failure} />
      <PlanPicker options={options} value={plan} onChange={setPlan} included={included} />

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_21rem] lg:gap-10">
        <div className="space-y-6 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8">
          <div>
            <h3 className="font-display text-2xl font-medium text-forest">Where and when</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Tell us where to come and which day suits you.
            </p>
          </div>

          <TextField
            label="Full name"
            autoComplete="name"
            required
            maxLength={80}
            value={values.name}
            error={errors["name"]}
            onChange={(event) => set("name")(event.target.value)}
          />
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            hint="We send your booking confirmation here."
            value={values.email}
            error={errors["email"]}
            onChange={(event) => set("email")(event.target.value)}
          />
          <div>
            <label htmlFor={cityId} className="mb-1.5 block text-sm font-medium text-foreground">
              City
            </label>
            <select
              id={cityId}
              value={values.city}
              aria-invalid={errors["city"] ? true : undefined}
              onChange={(event) => set("city")(event.target.value)}
              className={`${fieldClass} h-11 ${errors["city"] ? "border-destructive" : ""}`}
            >
              <option value="">Choose a city</option>
              {GARDENER_CITIES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
            {errors["city"] ? (
              <p className="mt-1.5 text-sm text-destructive">{errors["city"]}</p>
            ) : null}
          </div>
          <TextField
            label="Address"
            autoComplete="street-address"
            required
            maxLength={300}
            value={values.address}
            error={errors["address"]}
            onChange={(event) => set("address")(event.target.value)}
          />
          <TextField
            label={plan === ONE_TIME ? "Preferred visit date" : "Preferred first visit date"}
            type="date"
            required
            min={today()}
            value={values.date}
            error={errors["date"]}
            onChange={(event) => set("date")(event.target.value)}
          />
          <TextField
            label="Phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
            hint="So the gardener can reach you about the visit."
            value={values.phone}
            error={errors["phone"]}
            onChange={(event) => set("phone")(event.target.value)}
          />
          <div>
            <label htmlFor={notesId} className="mb-1.5 block text-sm font-medium text-foreground">
              Notes (optional)
            </label>
            <textarea
              id={notesId}
              rows={4}
              maxLength={500}
              value={values.notes}
              aria-invalid={errors["notes"] ? true : undefined}
              onChange={(event) => set("notes")(event.target.value)}
              className={`${fieldClass} py-3 ${errors["notes"] ? "border-destructive" : ""}`}
            />
            {errors["notes"] ? (
              <p className="mt-1.5 text-sm text-destructive">{errors["notes"]}</p>
            ) : null}
          </div>
          <label
            htmlFor={marketingId}
            className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-foreground"
          >
            <input
              id={marketingId}
              type="checkbox"
              checked={acceptsMarketing}
              onChange={(event) => setAcceptsMarketing(event.target.checked)}
              className="mt-0.5 size-4 accent-forest"
            />
            <span>
              Send me plant care tips and offers by email (optional). We will ask you to confirm.
            </span>
          </label>
          <Button type="submit" disabled={busy} className="h-11 w-full text-sm font-semibold">
            {busy ? "Adding…" : "Add booking to cart"}
          </Button>
        </div>

        <aside
          aria-label="Your booking"
          className="rounded-3xl bg-forest-deep p-6 text-cream shadow-xl lg:sticky lg:top-28"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sage">Your plan</p>
          <p className="mt-3 font-display text-2xl font-medium">{chosen?.label}</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="font-display text-4xl font-medium">
              {formatPrice(Number(chosen?.price ?? 0))}
            </span>
            <span className="text-sm text-cream/75">per visit</span>
          </p>
          <p className="mt-2 text-sm text-cream/75">{chosen?.note}</p>
          {chosen?.saving ? (
            <p className="mt-4 inline-flex rounded-full bg-cream/15 px-3 py-1 text-xs font-semibold">
              {chosen.saving} compared with a single visit
            </p>
          ) : null}
          <p className="mt-6 border-t border-cream/20 pt-4 text-xs leading-relaxed text-cream/70">
            You pay at checkout. Nothing is charged until you complete it.
          </p>
        </aside>
      </div>
    </form>
  );
}
