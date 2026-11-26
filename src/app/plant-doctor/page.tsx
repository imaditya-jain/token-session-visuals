import { Sprout } from "lucide-react";

import PlantDoctor from "@/components/plant-doctor/PlantDoctor";
import Header from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/sections";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";
import { plantDoctorEnabled } from "@/server/services/plant-doctor";

export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("plant-doctor", "/plant-doctor");

export default async function PlantDoctorPage() {
  const c = await getPageContent("plant-doctor");
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
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-cream/80">
            {c.text("header", "intro")}
          </p>
        </section>
        <div className="relative z-10 mx-auto -mt-20 max-w-5xl px-4 pb-20 sm:-mt-28 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] bg-background p-5 shadow-2xl ring-1 ring-border/60 sm:p-10 lg:p-14">
            <PlantDoctor enabled={plantDoctorEnabled()} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
