import type { ReactNode } from "react";

import CollectionBanner from "@/components/storefront/CollectionBanner";
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
      <main>
        {/* Same banner as the shop and collection pages, so every page opens the same way. */}
        <CollectionBanner image="/images/seasonal-greenhouse.jpg" title={title} tagline={eyebrow} />
        <div className="mx-auto max-w-7xl px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-20 lg:px-8">
          <div className="mx-auto w-full max-w-3xl">
            {intro ? (
              <p className="mb-10 text-lg leading-relaxed text-muted-foreground">{intro}</p>
            ) : null}
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
