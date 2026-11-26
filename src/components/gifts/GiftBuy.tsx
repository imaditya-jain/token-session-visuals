"use client";

import { Gift, Truck } from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";

import FormAlert from "@/components/auth/FormAlert";
import TextField from "@/components/auth/TextField";
import {
  fieldErrorsFromFailure,
  fieldErrorsFromZod,
  type FieldErrors,
} from "@/components/auth/useFormErrors";
import type { ApiFailure } from "@/features/auth/types";
import { setCartOpen } from "@/features/cart/cartSlice";
import { addToCart } from "@/features/cart/cartThunks";
import { earliestDeliveryDate, FRESH_DELIVERY, latestDeliveryDate } from "@/lib/gift";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";
const MESSAGE_MAX = 300;

/** Every date from the earliest to the latest, labelled for people ("Fri, 12 Dec"). */
function deliveryOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const last = latestDeliveryDate();
  for (let date = earliestDeliveryDate(); date <= last;) {
    const day = new Date(`${date}T12:00:00Z`);
    out.push({
      value: date,
      label: new Intl.DateTimeFormat("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(day),
    });
    day.setUTCDate(day.getUTCDate() + 1);
    date = day.toISOString().slice(0, 10);
  }
  return out;
}

/**
 * Add-to-cart for gifts. A fresh bouquet needs who it is for, where, and which day (Nagpur only); every gift can carry
 * a personal message. The details travel with the order line, so the florist and the delivery person see them.
 */
export default function GiftBuy({
  name,
  variantId,
  inStock,
  bouquet,
}: {
  name: string;
  variantId: string | undefined;
  inStock: boolean;
  bouquet: boolean;
}) {
  const dispatch = useAppDispatch();
  const busy = useAppSelector((state) => state.cart.busy);
  const ids = { date: useId(), address: useId(), message: useId() };
  const dates = useMemo(() => (bouquet ? deliveryOptions() : []), [bouquet]);
  const [values, setValues] = useState({
    recipient: "",
    address: "",
    phone: "",
    date: "",
    message: "",
    from: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  if (!inStock) {
    return (
      <p className="flex h-14 w-full items-center justify-center rounded-full bg-muted text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Sold out
      </p>
    );
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const { bouquetDeliverySchema, giftSchema } = await import("@/lib/gift-schemas");
    const parsed = bouquet
      ? bouquetDeliverySchema.safeParse({
          kind: "bouquet",
          ...values,
          message: values.message || undefined,
          from: values.from || undefined,
        })
      : giftSchema.safeParse({
          kind: "message",
          message: values.message || undefined,
          from: values.from || undefined,
        });
    if (!parsed.success) return setErrors(fieldErrorsFromZod(parsed.error));
    setErrors({});
    if (!variantId) {
      const failed: ApiFailure = {
        status: 0,
        code: "unavailable",
        message: "This item can't be ordered right now. Please try again later.",
      };
      setFailure(failed);
      return;
    }
    const added = await dispatch(addToCart({ variantId, gift: parsed.data })).unwrap();
    if (added) return void dispatch(setCartOpen(true));
    const failed: ApiFailure = {
      status: 0,
      code: "gift_failed",
      message: "We couldn't add this to your cart. Please try again.",
    };
    setErrors(fieldErrorsFromFailure(failed));
    setFailure(failed);
  };

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={`Order ${name}`}
      aria-busy={busy}
      className="w-full space-y-5 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border/60 sm:p-6"
    >
      <FormAlert failure={failure} />
      {bouquet ? (
        <>
          <div className="flex items-start gap-3 rounded-2xl bg-sage-light/60 p-4 text-sm text-forest">
            <Truck className="mt-0.5 size-5 shrink-0" aria-hidden />
            <p>
              Fresh flowers are delivered within <strong>{FRESH_DELIVERY.city}</strong>, on the day
              you choose.
            </p>
          </div>
          <TextField
            label="Who is it for?"
            required
            maxLength={80}
            autoComplete="off"
            value={values.recipient}
            error={errors["recipient"]}
            onChange={(e) => set("recipient")(e.target.value)}
          />
          <div>
            <label
              htmlFor={ids.address}
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              Delivery address in {FRESH_DELIVERY.city}
            </label>
            <textarea
              id={ids.address}
              rows={3}
              maxLength={300}
              value={values.address}
              aria-invalid={errors["address"] ? true : undefined}
              onChange={(e) => set("address")(e.target.value)}
              className={`${fieldClass} py-3 ${errors["address"] ? "border-destructive" : ""}`}
            />
            {errors["address"] ? (
              <p className="mt-1.5 text-sm text-destructive">{errors["address"]}</p>
            ) : null}
          </div>
          <TextField
            label="Phone number for the delivery"
            type="tel"
            inputMode="tel"
            required
            hint="The delivery person may call to find the address."
            value={values.phone}
            error={errors["phone"]}
            onChange={(e) => set("phone")(e.target.value)}
          />
          <div>
            <label htmlFor={ids.date} className="mb-1.5 block text-sm font-medium text-foreground">
              Delivery date
            </label>
            <select
              id={ids.date}
              value={values.date}
              aria-invalid={errors["date"] ? true : undefined}
              onChange={(e) => set("date")(e.target.value)}
              className={`${fieldClass} h-11 ${errors["date"] ? "border-destructive" : ""}`}
            >
              <option value="">Choose a date</option>
              {dates.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors["date"] ? (
              <p className="mt-1.5 text-sm text-destructive">{errors["date"]}</p>
            ) : null}
          </div>
        </>
      ) : null}

      <div>
        <label
          htmlFor={ids.message}
          className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <Gift className="size-4 text-clay" aria-hidden />
          Your message (optional)
        </label>
        <textarea
          id={ids.message}
          rows={3}
          maxLength={MESSAGE_MAX}
          value={values.message}
          placeholder="Write something they will keep…"
          aria-invalid={errors["message"] ? true : undefined}
          onChange={(e) => set("message")(e.target.value)}
          className={`${fieldClass} py-3 ${errors["message"] ? "border-destructive" : ""}`}
        />
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {values.message.length}/{MESSAGE_MAX}
        </p>
        {errors["message"] ? <p className="text-sm text-destructive">{errors["message"]}</p> : null}
      </div>
      <TextField
        label="From (name on the card, optional)"
        maxLength={80}
        value={values.from}
        error={errors["from"]}
        onChange={(e) => set("from")(e.target.value)}
      />

      <button
        type="submit"
        disabled={busy}
        aria-label={`Add to cart: ${name}`}
        className="flex h-14 w-full items-center justify-center rounded-full bg-forest px-8 text-sm font-semibold uppercase tracking-wider text-cream shadow-lg transition-all hover:-translate-y-0.5 hover:bg-forest-deep disabled:opacity-70"
      >
        {busy ? "Adding…" : "Add to cart"}
      </button>
    </form>
  );
}
