"use client";

export default function Newsletter() {
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
        <form
          className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
          onSubmit={(e) => e.preventDefault()}
        >
          <label className="sr-only" htmlFor="newsletter-email">
            Email address
          </label>
          <input
            id="newsletter-email"
            type="email"
            required
            placeholder="you@example.com"
            className="w-full flex-1 rounded-md border border-cream/25 bg-cream/10 px-4 py-3 text-sm text-cream outline-none transition-colors placeholder:text-cream/50 focus:border-sage"
          />
          <button
            type="submit"
            className="rounded-md bg-cream px-6 py-3 text-sm font-semibold text-forest-deep transition-colors hover:bg-cream/90"
          >
            Subscribe
          </button>
        </form>
        <p className="mt-4 text-xs text-cream/60">Unsubscribe anytime. No green thumb required.</p>
      </div>
    </section>
  );
}
