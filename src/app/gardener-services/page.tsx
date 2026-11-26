import { ArrowRight, CalendarCheck, ClipboardList, Leaf, MapPin, Sprout } from "lucide-react";
import Image from "next/image";

import ContactCta from "@/components/content/ContactCta";
import GardenerBooking from "@/components/gardener/GardenerBooking";
import Header from "@/components/storefront/Header";
import { Footer } from "@/components/storefront/sections";
import { GARDENER_CITIES } from "@/lib/gardener-schemas";
import { getGardenerService } from "@/server/services/gardener";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

/** The service is an ordinary Shopify product with Seal subscription plans, so the owner manages it in admin. */
export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("gardener-services", "/gardener-services");

const stepIcons = [ClipboardList, MapPin, CalendarCheck];

export default async function GardenerServicesPage() {
  const [service, c] = await Promise.all([
    getGardenerService(),
    getPageContent("gardener-services"),
  ]);
  const hero = c.image("hero", "image");
  const steps = c.cards("steps", "items");
  const faq = c.cards("faq", "items");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <section className="relative isolate overflow-hidden bg-forest-deep text-cream">
          <div
            aria-hidden
            className="absolute -left-32 top-10 -z-10 size-96 rounded-full bg-moss/30 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute -right-24 bottom-0 -z-10 size-[28rem] rounded-full bg-clay/20 blur-3xl"
          />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:px-8 lg:pb-32 lg:pt-24">
            <div className="animate-rise text-center lg:text-left">
              <p className="inline-flex items-center gap-2 rounded-full bg-cream/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-sage ring-1 ring-cream/15">
                <Sprout className="size-3.5" aria-hidden />
                {c.text("header", "eyebrow")}
              </p>
              <h1 className="mt-6 font-display text-5xl font-medium leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.5rem]">
                {c.text("header", "title")}
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-cream/80 lg:mx-0">
                {c.text("header", "intro")}
              </p>
              <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:justify-start">
                <a
                  href="#plans"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-cream px-8 text-sm font-semibold text-forest-deep shadow-lg transition-transform hover:-translate-y-0.5"
                >
                  {c.text("hero", "primary")}
                  <ArrowRight className="size-4" aria-hidden />
                </a>
                <a
                  href="#how-it-works"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-cream/30 px-8 text-sm font-semibold text-cream transition-colors hover:bg-cream/10"
                >
                  {c.text("hero", "secondary")}
                </a>
              </div>
              <ul className="mt-9 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                {GARDENER_CITIES.map((city) => (
                  <li
                    key={city}
                    className="inline-flex items-center gap-1.5 rounded-full bg-cream/10 px-4 py-1.5 text-sm text-cream/90 ring-1 ring-cream/15"
                  >
                    <MapPin className="size-3.5 text-sage" aria-hidden />
                    {city}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mx-auto h-[26rem] w-full max-w-md sm:h-[32rem] lg:max-w-none">
              <div className="absolute inset-y-0 right-0 w-[68%] overflow-hidden rounded-t-[999px] rounded-b-3xl shadow-2xl ring-1 ring-cream/15">
                <Image
                  src={hero.src}
                  alt={hero.alt}
                  fill
                  priority
                  sizes="(min-width: 1024px) 380px, 70vw"
                  className="object-cover"
                />
              </div>
              <div className="animate-float absolute bottom-10 left-0 size-40 overflow-hidden rounded-full shadow-2xl ring-4 ring-forest-deep sm:size-52">
                <Image
                  src={c.image("hero", "accent").src}
                  alt={c.image("hero", "accent").alt}
                  fill
                  sizes="208px"
                  className="object-cover"
                />
              </div>
              <div className="absolute right-2 top-8 flex items-center gap-3 rounded-2xl bg-cream/95 px-4 py-3 text-forest shadow-xl backdrop-blur sm:right-4">
                <span className="flex size-10 items-center justify-center rounded-full bg-sage-light">
                  <Leaf className="size-5" aria-hidden />
                </span>
                <span className="text-sm font-semibold leading-tight">
                  {c.text("hero", "badge")}
                </span>
              </div>
            </div>
          </div>
        </section>

        {steps.length > 0 && (
          <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-clay">
                {c.text("steps", "eyebrow")}
              </p>
              <h2 className="font-display text-3xl font-medium text-forest sm:text-4xl lg:text-5xl">
                {c.text("steps", "title")}
              </h2>
            </div>
            <ol className="relative grid gap-6 md:grid-cols-3">
              {steps.map((step, index) => {
                const Icon = stepIcons[index % stepIcons.length] ?? Sprout;
                return (
                  <li
                    key={step.title}
                    className="reveal relative overflow-hidden rounded-3xl bg-card p-8 shadow-sm ring-1 ring-border/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
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
          </section>
        )}

        <section id="plans" className="scroll-mt-24 bg-sage-light/60 py-20 lg:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-clay">
                {c.text("plans", "eyebrow")}
              </p>
              <h2 className="font-display text-3xl font-medium text-forest sm:text-4xl lg:text-5xl">
                {c.text("plans", "title")}
              </h2>
              <p className="mt-4 text-muted-foreground">{c.text("text", "content")}</p>
            </div>
            {service ? (
              <GardenerBooking
                service={service}
                included={c.list("plans", "included")}
                popular={c.text("plans", "popular")}
              />
            ) : (
              <div className="mx-auto max-w-xl rounded-3xl bg-card p-8 text-center shadow-sm ring-1 ring-border/60">
                <p className="font-display text-2xl text-forest">{c.text("soon", "title")}</p>
                <p className="mt-2 text-muted-foreground">{c.text("soon", "text")}</p>
              </div>
            )}
          </div>
        </section>

        {faq.length > 0 && (
          <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:py-28">
            <h2 className="mb-10 text-center font-display text-3xl font-medium text-forest sm:text-4xl">
              {c.text("faq", "title")}
            </h2>
            <div className="divide-y divide-border/70 rounded-3xl bg-card px-6 shadow-sm ring-1 ring-border/60">
              {faq.map((item) => (
                <details key={item.title} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-medium text-forest [&::-webkit-details-marker]:hidden">
                    {item.title}
                    <span
                      aria-hidden
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sage-light text-forest transition-transform duration-300 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{item.text}</p>
                </details>
              ))}
            </div>
            <ContactCta
              title={c.text("cta", "title")}
              topic="Something else"
              label={c.text("cta", "label")}
            />
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
