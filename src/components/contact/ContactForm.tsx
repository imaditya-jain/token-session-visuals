"use client";

import { useSearchParams } from "next/navigation";
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
import { CONTACT_TOPICS, contactSchema } from "@/lib/contact-schemas";

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

export default function ContactForm() {
  const topicId = useId();
  const requestedTopic = useSearchParams().get("topic");
  const messageId = useId();
  const [values, setValues] = useState({
    name: "",
    email: "",
    // Links from other pages preselect a topic; anything not on the list is ignored.
    topic:
      CONTACT_TOPICS.find((topic) => topic === requestedTopic) ?? (CONTACT_TOPICS[0] as string),
    message: "",
    website: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (key: keyof typeof values) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFailure(null);
    const parsed = contactSchema.safeParse(values);
    if (!parsed.success) return setErrors(fieldErrorsFromZod(parsed.error));
    setErrors({});
    setPending(true);
    try {
      await publicJson("/api/contact", "POST", parsed.data);
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
        <h2 className="font-display text-2xl font-medium text-forest">Message sent</h2>
        <p className="text-sm text-muted-foreground">
          Thanks, {values.name}. We read every message and reply within one business day.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5" aria-busy={pending}>
      <FormAlert failure={failure} />
      <TextField
        label="Your name"
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
        value={values.email}
        error={errors["email"]}
        onChange={(event) => set("email")(event.target.value)}
      />
      <div>
        <label htmlFor={topicId} className="mb-1.5 block text-sm font-medium text-foreground">
          Topic
        </label>
        <select
          id={topicId}
          value={values.topic}
          onChange={(event) => set("topic")(event.target.value)}
          className={`${fieldClass} h-11`}
        >
          {CONTACT_TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={messageId} className="mb-1.5 block text-sm font-medium text-foreground">
          Message
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
        {pending ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
