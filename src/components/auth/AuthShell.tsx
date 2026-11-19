import type { ReactNode } from "react";

import CollectionBanner from "@/components/storefront/CollectionBanner";
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
      <main>
        {/* Same banner as the shop and collection pages, so every page opens the same way. */}
        <CollectionBanner image="/images/seasonal-greenhouse.jpg" title={title} tagline={eyebrow} />
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8">
          <div className={`mx-auto w-full ${wide ? "max-w-2xl" : "max-w-md"}`}>
            {description ? (
              <p className="mb-8 text-center text-muted-foreground">{description}</p>
            ) : null}
            {wide ? (
              <div>{children}</div>
            ) : (
              <div className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8">
                {children}
              </div>
            )}
            {footer ? (
              <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
            ) : null}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
