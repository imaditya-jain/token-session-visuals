import { HeartHandshake, Leaf, ShieldCheck, Sprout } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import RichBody from "@/components/content/RichBody";
import CollectionBanner from "@/components/storefront/CollectionBanner";
import Header from "@/components/storefront/Header";
import { Footer, WaveTop } from "@/components/storefront/sections";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("about", "/about");

const principleIcons = [Sprout, ShieldCheck, HeartHandshake, Leaf];

export default async function AboutPage() {
  const c = await getPageContent("about");
  const picture = c.image("story", "image");
  const stats = c.cards("stats", "items");
  const principles = c.cards("principles", "items");
  const primary = c.link("actions", "primary");
  const secondary = c.link("actions", "secondary");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <CollectionBanner
          image={c.image("hero", "image").src}
          title={c.text("header", "title")}
          tagline={c.text("header", "eyebrow")}
        />

        <section
          aria-labelledby="our-story"
          className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8 lg:py-24"
        >
          <div className="relative">
            <Image
              src={picture.src}
              alt={picture.alt}
              width={1200}
              height={1400}
              sizes="(min-width: 1024px) 560px, 100vw"
              priority
              className="aspect-[4/5] w-full rounded-t-[999px] rounded-b-[2rem] object-cover shadow-2xl"
            />
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-clay">
              {c.text("story", "eyebrow")}
            </p>
            <h2
              id="our-story"
              className="font-display text-3xl font-medium leading-tight text-forest sm:text-4xl lg:text-5xl"
            >
              {c.text("story", "title")}
            </h2>
            <RichBody doc={c.doc("story", "content")} className="mt-6 text-lg" />
          </div>
        </section>

        {stats.length > 0 && (
          <section aria-label="Fernwood in numbers" className="bg-forest-deep text-cream">
            <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-y-10 px-4 py-14 sm:px-6 lg:grid-cols-4 lg:px-8 lg:py-16">
              {stats.map((stat) => (
                <div key={stat.title} className="flex flex-col text-center">
                  <dt className="order-2 mt-2 text-sm text-cream/75">{stat.text}</dt>
                  <dd className="font-display text-4xl font-medium text-cream sm:text-5xl lg:text-6xl">
                    {stat.title}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="relative bg-sage-light/60 pb-20 pt-28 lg:pb-28 lg:pt-36">
          <WaveTop className="text-forest-deep" />
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="mb-12 text-center font-display text-3xl font-medium text-forest sm:text-4xl lg:text-5xl">
              {c.text("principles", "title")}
            </h2>
            <ul className="grid gap-5 sm:grid-cols-2">
              {principles.map((item, index) => {
                const Icon = principleIcons[index % principleIcons.length] ?? Leaf;
                return (
                  <li
                    key={item.title}
                    className="reveal flex gap-5 rounded-3xl bg-card p-7 shadow-sm ring-1 ring-border/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                  >
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-forest text-cream shadow-md">
                      <Icon className="size-7" aria-hidden />
                    </span>
                    <div>
                      <h3 className="font-display text-xl font-medium text-forest">{item.title}</h3>
                      <p className="mt-2 leading-relaxed text-muted-foreground">{item.text}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-forest px-4 py-20 text-center text-cream sm:px-6 lg:py-24">
          <div
            aria-hidden
            className="absolute left-1/2 top-0 -z-10 size-[30rem] -translate-x-1/2 rounded-full bg-moss/30 blur-3xl"
          />
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-medium sm:text-4xl lg:text-5xl">
            {c.text("actions", "title")}
          </h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={primary.href}
              className="inline-flex h-12 items-center justify-center rounded-full bg-cream px-8 text-sm font-semibold text-forest-deep shadow-lg transition-transform hover:-translate-y-0.5"
            >
              {primary.label}
            </Link>
            <Link
              href={secondary.href}
              className="inline-flex h-12 items-center justify-center rounded-full border border-cream/30 px-8 text-sm font-semibold text-cream transition-colors hover:bg-cream/10"
            >
              {secondary.label}
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
