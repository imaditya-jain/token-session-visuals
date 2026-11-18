import type { ReactNode } from "react";

import Header from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/sections";

/** Page frame shared by login, register and the other account-flow pages. */
export default function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Children render their own cards (no outer card), at a wider measure. */
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className={`mx-auto w-full ${wide ? "max-w-2xl" : "max-w-md"}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-clay">{eyebrow}</p>
          <h1 className="mt-3 font-display text-4xl font-medium leading-tight text-forest sm:text-5xl">
            {title}
          </h1>
          {description ? <p className="mt-3 text-muted-foreground">{description}</p> : null}
          {wide ? (
            <div className="mt-8">{children}</div>
          ) : (
            <div className="mt-8 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8">
              {children}
            </div>
          )}
          {footer ? (
            <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  );
}
