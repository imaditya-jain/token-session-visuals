import { CalendarHeart, Gift, MapPin, PenLine, Truck } from "lucide-react";
import Link from "next/link";

import BouquetBrowser from "@/components/gifts/BouquetBrowser";
import ProductCard from "@/components/storefront/ProductCard";
import CollectionBanner from "@/components/storefront/CollectionBanner";
import Header from "@/components/storefront/Header";
import { Footer, WaveTop } from "@/components/storefront/sections";
import { getCollectionAll } from "@/data/catalog";
import { FRESH_DELIVERY } from "@/lib/gift";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("gifts", "/gifts");

const stepIcons = [Gift, PenLine, Truck];

export default async function GiftsPage() {
  const [c, bouquets, gifts] = await Promise.all([
    getPageContent("gifts"),
    getCollectionAll("bouquets"),
    getCollectionAll("gifts"),
  ]);
  const hero = c.image("hero", "image");
  const steps = c.cards("steps", "items");
  const giftsCta = c.link("gifts", "cta");
  const shownGifts = (gifts ?? []).slice(0, 4);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <CollectionBanner
          image={hero.src}
          title={c.text("header", "title")}
          tagline={c.text("header", "eyebrow")}
        />

        <section aria-label="Delivery in Nagpur" className="mx-auto max-w-5xl px-4 pt-14 sm:px-6">
          <div className="grid gap-4 rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:grid-cols-3 sm:p-8">
            {[
              {
                icon: MapPin,
                title: c.text("delivery", "title"),
                text: c.text("delivery", "text"),
              },
              {
                icon: CalendarHeart,
                title: "Your day",
                text: "Choose the delivery date when you order.",
              },
              { icon: PenLine, title: "Your words", text: "Add a personal message to every gift." },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-forest text-cream">
                  <Icon className="size-6" aria-hidden />
                </span>
                <div>
                  <h2 className="font-display text-lg font-medium text-forest">{title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Fresh bouquets: {FRESH_DELIVERY.city} only.
          </p>
        </section>

        <section
          id="bouquets"
          className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
        >
          <h2 className="mb-10 text-center font-display text-3xl font-medium text-forest sm:text-4xl lg:text-5xl">
            {c.text("bouquets", "title")}
          </h2>
          <BouquetBrowser products={bouquets ?? []} empty={c.text("bouquets", "empty")} />
        </section>

        {steps.length > 0 ? (
          <section className="relative bg-sage-light/60 pb-20 pt-28 lg:pb-28 lg:pt-36">
            <WaveTop className="text-background" />
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <h2 className="mb-12 text-center font-display text-3xl font-medium text-forest sm:text-4xl">
                {c.text("steps", "title")}
              </h2>
              <ol className="grid gap-5 md:grid-cols-3">
                {steps.map((step, index) => {
                  const Icon = stepIcons[index % stepIcons.length] ?? Gift;
                  return (
                    <li
                      key={step.title}
                      className="reveal relative overflow-hidden rounded-3xl bg-card p-8 shadow-sm ring-1 ring-border/60"
                    >
                      <span
                        aria-hidden
                        className="absolute right-5 top-1 font-display text-[6.5rem] font-medium leading-none text-sage-light"
                      >
                        {index + 1}
                      </span>
                      <span className="relative flex size-14 items-center justify-center rounded-2xl bg-forest text-cream shadow-md">
                        <Icon className="size-7" aria-hidden />
                      </span>
                      <h3 className="relative mt-8 font-display text-2xl font-medium text-forest">
                        <span className="sr-only">Step {index + 1}: </span>
                        {step.title}
                      </h3>
                      <p className="relative mt-3 leading-relaxed text-muted-foreground">
                        {step.text}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
        ) : null}

        {shownGifts.length > 0 ? (
          <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-3xl font-medium text-forest sm:text-4xl">
                {c.text("gifts", "title")}
              </h2>
              <Link
                href={giftsCta.href}
                className="text-sm font-semibold text-forest underline-offset-4 hover:text-clay hover:underline"
              >
                {giftsCta.label}
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
              {shownGifts.map((product) => (
                <li key={product.id}>
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
