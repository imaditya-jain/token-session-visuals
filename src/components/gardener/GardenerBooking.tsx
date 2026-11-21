"use client";

import { useId, useState, type FormEvent } from "react";

import FormAlert from "@/components/auth/FormAlert";
import TextField from "@/components/auth/TextField";
import {
  fieldErrorsFromFailure,
  fieldErrorsFromZod,
  type FieldErrors,
} from "@/components/auth/useFormErrors";
import { Button } from "@/components/ui/button";
import type { ApiFailure } from "@/features/auth/types";
import { setCartOpen } from "@/features/cart/cartSlice";
import { addToCart } from "@/features/cart/cartThunks";
import { formatPrice } from "@/lib/format";
import type { GardenerService } from "@/lib/gardener";
import { bookingSchema, GARDENER_CITIES } from "@/lib/gardener-schemas";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

const ONE_TIME = "one-time";

/** Today as YYYY-MM-DD in the visitor's own calendar, for the date picker's minimum. */
const today = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

export default function GardenerBooking({ service }: { service: GardenerService }) {
  const dispatch = useAppDispatch();
  const busy = useAppSelector((state) => state.cart.busy);
  const cityId = useId();
  const notesId = useId();
  const [plan, setPlan] = useState<string>(ONE_TIME);
  const [values, setValues] = useState({
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

  const options = [
    {
      value: ONE_TIME,
      label: "One-time visit",
      detail: `${formatPrice(Number(service.oneTimePrice))} per visit`,
    },
    ...service.plans.map((candidate) => ({
      value: candidate.id,
      label: candidate.name,
      detail: `${formatPrice(Number(candidate.price))} per visit, charged each visit`,
    })),
  ];

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6" aria-busy={busy}>
      <FormAlert failure={failure} />
      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-medium text-foreground">Choose how often</legend>
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-4 ring-1 transition-colors ${
              plan === option.value
                ? "bg-sage-light/50 ring-forest"
                : "bg-card ring-border/60 hover:ring-forest/50"
            }`}
          >
            <input
              type="radio"
              name="plan"
              value={option.value}
              checked={plan === option.value}
              onChange={() => setPlan(option.value)}
              className="mt-1 size-4 accent-forest"
            />
            <span>
              <span className="block text-sm font-medium text-forest">{option.label}</span>
              <span className="block text-sm text-muted-foreground">{option.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

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
      <Button type="submit" disabled={busy} className="h-11 w-full text-sm font-semibold">
        {busy ? "Adding…" : "Add booking to cart"}
      </Button>
    </form>
  );
}
