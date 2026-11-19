import type { ReactNode } from "react";

import Header from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/sections";

/** Page frame for editorial and legal pages: eyebrow, serif title, readable measure. */
export default function ContentShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-clay">{eyebrow}</p>
          <h1 className="mt-3 font-display text-4xl font-medium leading-tight text-forest sm:text-5xl">
            {title}
          </h1>
          {intro ? (
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{intro}</p>
          ) : null}
          <div className="mt-10">{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
