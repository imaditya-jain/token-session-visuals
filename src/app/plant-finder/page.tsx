import { Sprout } from "lucide-react";

import Header from "@/components/storefront/Header";
import PlantFinder from "@/components/plant-finder/PlantFinder";
import { Footer } from "@/components/storefront/sections";
import { getProducts } from "@/data/catalog";
import { isPlant } from "@/lib/plant-finder";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

/** Prebuilt and cached like the rest of the catalogue; the quiz itself runs in the browser. */
export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("plant-finder", "/plant-finder");

export default async function PlantFinderPage() {
  const [products, c] = await Promise.all([getProducts(), getPageContent("plant-finder")]);
  const plants = products.filter(isPlant);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <section className="relative isolate overflow-hidden bg-forest-deep px-4 pb-28 pt-14 text-center text-cream sm:px-6 sm:pb-36 sm:pt-20">
          <div
            aria-hidden
            className="absolute -left-24 -top-16 -z-10 size-80 rounded-full bg-moss/30 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute -right-20 bottom-0 -z-10 size-96 rounded-full bg-clay/20 blur-3xl"
          />
          <p className="inline-flex items-center gap-2 rounded-full bg-cream/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-sage ring-1 ring-cream/15">
            <Sprout className="size-3.5" aria-hidden />
            {c.text("header", "eyebrow")}
          </p>
          <h1 className="mt-5 font-display text-5xl font-medium tracking-tight sm:text-6xl lg:text-7xl">
            {c.text("header", "title")}
          </h1>
        </section>
        <div className="relative z-10 mx-auto -mt-20 max-w-5xl px-4 pb-20 sm:-mt-28 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] bg-background p-5 shadow-2xl ring-1 ring-border/60 sm:p-10 lg:p-14">
            <PlantFinder
              plants={plants}
              copy={{
                introTitle: c.text("intro", "title"),
                introText: c.text("intro", "text"),
                introButton: c.text("intro", "button"),
                resultTitle: c.text("result", "title"),
                retakeLabel: c.text("result", "retake"),
              }}
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
