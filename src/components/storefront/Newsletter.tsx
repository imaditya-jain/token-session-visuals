"use client";

import { useState, type FormEvent } from "react";

import { ApiError, postJson } from "@/lib/api-client";
import { subscribeSchema } from "@/lib/newsletter-schemas";

type State =
  | { phase: "idle" | "sending" }
  | { phase: "sent"; email: string }
  | { phase: "error"; message: string };

export default function Newsletter() {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [email, setEmail] = useState("");

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = subscribeSchema.safeParse({ email });
    if (!parsed.success) {
      setState({
        phase: "error",
        message: parsed.error.issues[0]?.message ?? "Enter a valid email address",
      });
      return;
    }
    setState({ phase: "sending" });
    try {
      await postJson("/api/newsletter", parsed.data);
      setState({ phase: "sent", email: parsed.data.email });
    } catch (error) {
      setState({
        phase: "error",
        message: error instanceof ApiError ? error.message : "Network problem. Please try again.",
      });
    }
  };

  const sending = state.phase === "sending";

  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
      <div className="overflow-hidden rounded-3xl bg-forest px-6 py-14 text-center text-cream sm:px-12 lg:py-16">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-sage">
          Join the greenhouse club
        </p>
        <h2 className="mx-auto max-w-xl font-display text-3xl font-medium sm:text-4xl">
          Get 10% off your first order
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-sm text-cream/85">
          Seasonal care tips, early access to rare drops and members-only savings — one thoughtful
          email a month, never spam.
        </p>
        {state.phase === "sent" ? (
          <p
            role="status"
            className="mx-auto mt-8 max-w-md rounded-md border border-cream/25 bg-cream/10 px-4 py-4 text-sm"
          >
            Almost there! Check <span className="font-semibold">{state.email}</span> and tap the
            link to confirm your subscription.
          </p>
        ) : (
          <form
            className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
            onSubmit={onSubmit}
            noValidate
          >
            <label className="sr-only" htmlFor="newsletter-email">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={state.phase === "error" ? true : undefined}
              aria-describedby={state.phase === "error" ? "newsletter-error" : undefined}
              className="w-full flex-1 rounded-md border border-cream/25 bg-cream/10 px-4 py-3 text-sm text-cream outline-none transition-colors placeholder:text-cream/50 focus:border-sage"
            />
            <button
              type="submit"
              disabled={sending}
              className="rounded-md bg-cream px-6 py-3 text-sm font-semibold text-forest-deep transition-colors hover:bg-cream/90 disabled:opacity-70"
            >
              {sending ? "Sending…" : "Subscribe"}
            </button>
          </form>
        )}
        {state.phase === "error" ? (
          <p
            id="newsletter-error"
            role="alert"
            className="mx-auto mt-3 max-w-md rounded-md border border-clay bg-clay/20 px-3 py-2 text-sm text-cream"
          >
            {state.message}
          </p>
        ) : null}
        <p className="mt-4 text-xs text-cream/60">Unsubscribe anytime. No green thumb required.</p>
      </div>
    </section>
  );
}
