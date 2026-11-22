import type { ReactNode } from "react";

import Header from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/sections";

/** Page frame for blog pages. Each page's template supplies its own hero and its single h1. */
export default function BlogFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
