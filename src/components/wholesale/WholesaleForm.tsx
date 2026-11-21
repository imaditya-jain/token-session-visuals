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
import { ApiError, publicJson } from "@/lib/api-client";
import { BUSINESS_TYPES, wholesaleSchema } from "@/lib/wholesale-schemas";

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

const empty = {
  businessName: "",
  contactName: "",
  email: "",
  phone: "",
  businessType: "",
  location: "",
  taxId: "",
  message: "",
  website: "",
};

export default function WholesaleForm() {
  const typeId = useId();
  const messageId = useId();
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof typeof empty) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const parsed = wholesaleSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrorsFromZod(parsed.error));
    setErrors({});
    setPending(true);
    try {
      await publicJson("/api/wholesale", "POST", parsed.data);
      setSent(true);
    } catch (error) {
      const failed: ApiFailure =
        error instanceof ApiError
          ? error.toJSON()
          : {
              status: 0,
              code: "network_error",
              message: "Network problem. Check your connection and try again.",
            };
      setErrors(fieldErrorsFromFailure(failed));
      setFailure(failed);
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="space-y-3 text-center">
        <h2 className="font-display text-2xl font-medium text-forest">Application received</h2>
        <p className="text-sm text-muted-foreground">
          Thanks, {values.contactName}. We will review it and come back to you by email.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" aria-busy={pending}>
      <FormAlert failure={failure} />
      <TextField
        label="Business name"
        autoComplete="organization"
        required
        maxLength={120}
        value={values.businessName}
        error={errors["businessName"]}
        onChange={(event) => set("businessName")(event.target.value)}
      />
      <TextField
        label="Your name"
        autoComplete="name"
        required
        maxLength={80}
        value={values.contactName}
        error={errors["contactName"]}
        onChange={(event) => set("contactName")(event.target.value)}
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={values.email}
        error={errors["email"]}
        onChange={(event) => set("email")(event.target.value)}
      />
      <TextField
        label="Phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        required
        value={values.phone}
        error={errors["phone"]}
        onChange={(event) => set("phone")(event.target.value)}
      />
      <div>
        <label htmlFor={typeId} className="mb-1.5 block text-sm font-medium text-foreground">
          Type of business
        </label>
        <select
          id={typeId}
          value={values.businessType}
          aria-invalid={errors["businessType"] ? true : undefined}
          onChange={(event) => set("businessType")(event.target.value)}
          className={`${fieldClass} h-11 ${errors["businessType"] ? "border-destructive" : ""}`}
        >
          <option value="">Choose one</option>
          {BUSINESS_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        {errors["businessType"] ? (
          <p className="mt-1.5 text-sm text-destructive">{errors["businessType"]}</p>
        ) : null}
      </div>
      <TextField
        label="City and country"
        autoComplete="address-level2"
        required
        maxLength={120}
        value={values.location}
        error={errors["location"]}
        onChange={(event) => set("location")(event.target.value)}
      />
      <TextField
        label="Tax or business registration number (optional)"
        maxLength={40}
        value={values.taxId}
        error={errors["taxId"]}
        onChange={(event) => set("taxId")(event.target.value)}
      />
      <div>
        <label htmlFor={messageId} className="mb-1.5 block text-sm font-medium text-foreground">
          What are you looking for?
        </label>
        <textarea
          id={messageId}
          required
          rows={6}
          maxLength={3000}
          value={values.message}
          aria-invalid={errors["message"] ? true : undefined}
          aria-describedby={errors["message"] ? `${messageId}-error` : undefined}
          onChange={(event) => set("message")(event.target.value)}
          className={`${fieldClass} py-3 ${errors["message"] ? "border-destructive" : ""}`}
        />
        {errors["message"] ? (
          <p id={`${messageId}-error`} className="mt-1.5 text-sm text-destructive">
            {errors["message"]}
          </p>
        ) : null}
      </div>
      {/* Honeypot: hidden from people and assistive tech, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={(event) => set("website")(event.target.value)}
          />
        </label>
      </div>
      <Button type="submit" disabled={pending} className="h-11 w-full text-sm font-semibold">
        {pending ? "Sending…" : "Send application"}
      </Button>
    </form>
  );
}
