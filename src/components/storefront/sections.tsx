import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Heart, X } from "lucide-react";

import { getBestSellers, getCollections } from "@/data/catalog";
import CollectionCard from "@/components/storefront/CollectionCard";
import Logo from "@/components/storefront/Logo";
import CollectionSlider from "@/components/storefront/CollectionSlider";
import ProductCard from "@/components/storefront/ProductCard";
import SocialIcon from "@/components/storefront/SocialIcon";
import { phoneHref, SOCIAL_PLATFORMS } from "@/lib/site-chrome";
import { getPageContent } from "@/server/services/page-content-public";
import { getSiteChrome } from "@/server/services/site-chrome-public";
import { Truck, Leaf, HeartHandshake, Sprout, Star, Quote, ShieldCheck } from "lucide-react";

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
      {eyebrow && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-clay">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-3xl font-medium text-forest sm:text-4xl lg:text-[2.75rem]">
        {title}
      </h2>
      {description && <p className="mt-4 text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Soft curved edge that paints the previous section's colour over the top of a band. */
function WaveTop({ className }: { className: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 1440 40"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 top-0 h-4 w-full sm:h-8 ${className}`}
      fill="currentColor"
    >
      <path d="M0 0h1440v10C1200 40 960 40 720 22S240-6 0 26Z" />
    </svg>
  );
}

const trustIcons = [Truck, ShieldCheck, Leaf, Sprout];

/** Four short promises directly under the hero. */
export async function TrustBar() {
  const c = await getPageContent("home");
  const items = c.cards("trust", "items");
  if (items.length === 0) return null;
  return (
    <section aria-label="Why shop with Fernwood" className="relative z-10 -mt-px bg-background">
      <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-6 px-4 py-8 sm:px-6 lg:grid-cols-4 lg:gap-x-8 lg:px-8 lg:py-10">
        {items.map((item, index) => {
          const Icon = trustIcons[index % trustIcons.length] ?? Leaf;
          return (
            <li key={item.title} className="flex items-start gap-3">
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-sage-light text-forest">
                <Icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-forest">{item.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground sm:text-sm">
                  {item.text}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export async function Collections() {
  const collections = await getCollections();
  if (collections.length === 0) return null;
  const c = await getPageContent("home");
  const cta = c.link("collections", "cta");
  return (
    <section
      id="collections"
      className="mx-auto max-w-7xl px-4 pb-20 pt-14 sm:px-6 lg:px-8 lg:pb-28"
    >
      <SectionHeading
        eyebrow={c.text("collections", "eyebrow")}
        title={c.text("collections", "title")}
        description={c.text("collections", "description")}
      />
      <CollectionSlider label={c.text("collections", "title")}>
        {collections.map((collection) => (
          <CollectionCard key={collection.slug} collection={collection} />
        ))}
      </CollectionSlider>
      <div className="mt-6 text-center">
        <Link
          href={cta.href}
          className="inline-flex items-center gap-2 rounded-md border border-forest/30 px-7 py-3 text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
        >
          {cta.label} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

/** A teaser for the Plant Finder: a short pitch and a stack of swipe cards that opens the quiz. */
export async function PlantFinderTeaser() {
  const c = await getPageContent("home");
  const cta = c.link("finder", "cta");
  const eyebrow = c.text("finder", "eyebrow");
  const cards = [c.image("finder", "cardOne"), c.image("finder", "cardTwo")];
  const front = c.image("finder", "cardThree");
  return (
    <section id="plant-finder" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="rounded-2xl bg-sage-light p-8 sm:p-12">
          {eyebrow && (
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-clay">
              {eyebrow}
            </p>
          )}
          <h2 className="font-display text-3xl font-medium text-forest sm:text-4xl">
            {c.text("finder", "title")}
          </h2>
          <p className="mt-5 leading-relaxed text-foreground/80">{c.text("finder", "text")}</p>
          <Link
            href={cta.href}
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-forest px-7 py-3 text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
          >
            {cta.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <Link
          href={cta.href}
          aria-label={cta.label}
          className="group relative mx-auto block aspect-[3/4] w-full max-w-[19rem]"
        >
          {cards.map((card, index) => (
            <span
              key={card.src}
              aria-hidden
              className={`absolute inset-0 overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-border/60 transition-transform duration-500 ${
                index === 0
                  ? "-translate-x-5 -rotate-6 group-hover:-translate-x-8 group-hover:-rotate-[9deg]"
                  : "translate-x-4 rotate-3 group-hover:translate-x-7 group-hover:rotate-[6deg]"
              }`}
            >
              <Image
                src={card.src}
                alt=""
                width={600}
                height={760}
                sizes="304px"
                className="h-3/4 w-full object-cover"
              />
            </span>
          ))}
          <span className="absolute inset-0 flex flex-col overflow-hidden rounded-2xl bg-card shadow-xl ring-1 ring-border/60 transition-transform duration-500 group-hover:-translate-y-1">
            <Image
              src={front.src}
              alt={front.alt}
              width={600}
              height={760}
              sizes="304px"
              className="h-3/4 w-full object-cover"
            />
            <span className="flex flex-1 items-center justify-center gap-5">
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-muted text-foreground">
                <X className="size-5" aria-hidden />
              </span>
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-forest text-cream">
                <Heart className="size-5 fill-current" aria-hidden />
              </span>
            </span>
          </span>
        </Link>
      </div>
    </section>
  );
}

export async function BestSellers() {
  const bestSellers = await getBestSellers();
  if (bestSellers.length === 0) return null;
  const c = await getPageContent("home");
  const cta = c.link("bestSellers", "cta");
  return (
    <section id="best-sellers" className="relative bg-sage-light/60 pb-20 pt-24 lg:pb-28 lg:pt-32">
      <WaveTop className="text-background" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={c.text("bestSellers", "eyebrow")}
          title={c.text("bestSellers", "title")}
          description={c.text("bestSellers", "description")}
        />
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {bestSellers.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            href={cta.href}
            className="inline-flex items-center gap-2 rounded-md border border-forest bg-transparent px-7 py-3 text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
          >
            {cta.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

export async function PromoSplit() {
  const c = await getPageContent("home");
  const image = c.image("promo", "image");
  const cta = c.link("promo", "cta");
  const eyebrow = c.text("promo", "eyebrow");
  return (
    <section className="relative bg-sand/60">
      <WaveTop className="text-background" />
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-24 sm:px-6 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="relative order-2 lg:order-1">
            <Image
              src={image.src}
              alt={image.alt}
              width={1200}
              height={900}
              sizes="(min-width: 1024px) 600px, 100vw"
              className="aspect-[5/4] w-full rounded-2xl object-cover shadow-md"
            />
            <div className="absolute -bottom-5 left-6 hidden rounded-xl bg-forest px-6 py-4 text-cream shadow-lg sm:block">
              <p className="font-display text-2xl">{c.text("promo", "statValue")}</p>
              <p className="text-xs uppercase tracking-wider text-sage">
                {c.text("promo", "statLabel")}
              </p>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            {eyebrow && (
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-clay">
                {eyebrow}
              </p>
            )}
            <h2 className="font-display text-3xl font-medium text-forest sm:text-4xl">
              {c.text("promo", "title")}
            </h2>
            <p className="mt-5 leading-relaxed text-muted-foreground">{c.text("promo", "text")}</p>
            <ul className="mt-6 space-y-3 text-sm text-foreground/90">
              {c.list("promo", "bullets").map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Sprout className="mt-0.5 size-4 shrink-0 text-clay" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href={cta.href}
              className="mt-8 inline-flex items-center gap-2 rounded-md bg-forest px-7 py-3 text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
            >
              {cta.label} <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export async function SeasonalBanner() {
  const c = await getPageContent("home");
  const image = c.image("seasonal", "image");
  const cta = c.link("seasonal", "cta");
  const eyebrow = c.text("seasonal", "eyebrow");
  const note = c.text("seasonal", "note");
  return (
    <section className="relative overflow-hidden">
      <Image
        src={image.src}
        alt={image.alt}
        width={1600}
        height={900}
        sizes="100vw"
        className="h-[480px] w-full object-cover sm:h-[560px]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-forest-deep/70 via-forest-deep/30 to-transparent" />
      <div className="absolute inset-0 flex items-center">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-lg rounded-2xl bg-cream/92 p-8 shadow-xl backdrop-blur-sm sm:p-10">
            {eyebrow && (
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-clay">
                {eyebrow}
              </p>
            )}
            <h2 className="font-display text-3xl font-medium text-forest sm:text-4xl">
              {c.text("seasonal", "title")}
            </h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              {c.text("seasonal", "text")}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={cta.href}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-clay px-7 py-3 text-sm font-semibold text-cream transition-colors hover:bg-clay-deep"
              >
                {cta.label} <ArrowRight className="size-4" aria-hidden />
              </a>
              {note && <p className="text-xs text-muted-foreground">{note}</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const perkIcons = [Leaf, Truck, HeartHandshake, Sprout, Star, Leaf];

export async function WhyUs() {
  const c = await getPageContent("home");
  const perks = c.cards("whyUs", "perks");
  return (
    <section id="our-story" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <SectionHeading eyebrow={c.text("whyUs", "eyebrow")} title={c.text("whyUs", "title")} />
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {perks.map((perk, index) => {
          const Icon = perkIcons[index % perkIcons.length] ?? Leaf;
          return (
            <div
              key={perk.title}
              className="rounded-2xl bg-card p-7 shadow-sm ring-1 ring-border/60 transition-shadow hover:shadow-md"
            >
              <div className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-sage-light text-forest">
                <Icon className="size-6" aria-hidden />
              </div>
              <h3 className="font-display text-lg font-medium text-forest">{perk.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{perk.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export async function StoryTestimonial() {
  const c = await getPageContent("home");
  const image = c.image("story", "image");
  const cta = c.link("story", "cta");
  const eyebrow = c.text("story", "eyebrow");
  return (
    <section className="bg-forest text-cream">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-28">
        <div>
          {eyebrow && (
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-sage">
              {eyebrow}
            </p>
          )}
          <h2 className="font-display text-3xl font-medium sm:text-4xl">
            {c.text("story", "title")}
          </h2>
          <p className="mt-5 leading-relaxed text-cream/85">{c.text("story", "paragraph1")}</p>
          <p className="mt-4 leading-relaxed text-cream/85">{c.text("story", "paragraph2")}</p>
          <Link
            href={cta.href}
            className="mt-8 inline-flex items-center gap-2 rounded-md border border-cream/50 px-7 py-3 text-sm font-semibold text-cream transition-colors hover:bg-cream/10"
          >
            {cta.label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <Image
          src={image.src}
          alt={image.alt}
          width={1200}
          height={900}
          sizes="(min-width: 1024px) 600px, 100vw"
          className="aspect-[5/4] w-full rounded-2xl object-cover shadow-xl"
        />
      </div>
    </section>
  );
}

export async function Testimonials() {
  const c = await getPageContent("home");
  const testimonials = c.quotes("testimonials", "quotes");
  return (
    <section className="relative bg-sage-light/60">
      <WaveTop className="text-forest" />
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-24 sm:px-6 lg:px-8 lg:pb-28 lg:pt-32">
        <SectionHeading
          eyebrow={c.text("testimonials", "eyebrow")}
          title={c.text("testimonials", "title")}
          description={c.text("testimonials", "description")}
        />
        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure
              key={t.name}
              className="flex flex-col rounded-2xl bg-card p-7 shadow-sm ring-1 ring-border/60"
            >
              <Quote className="mb-4 size-7 text-clay/60" aria-hidden />
              <div className="mb-3 flex gap-0.5" role="img" aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-4 fill-clay text-clay" aria-hidden />
                ))}
              </div>
              <blockquote className="flex-1 text-sm leading-relaxed text-foreground/90">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-5 border-t border-border pt-4">
                <p className="font-display text-base font-medium text-forest">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.location}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function Footer() {
  const { footer, social } = await getSiteChrome();
  const { contact } = footer;
  const links = social.filter((entry) => entry.enabled);
  return (
    <footer id="footer" className="bg-forest-deep text-cream">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="font-display text-3xl font-medium">
              <Logo tone="dark" />
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-cream/75">{footer.about}</p>
            {links.length > 0 ? (
              <div className="mt-6 flex gap-3">
                {links.map((s) => (
                  <a
                    key={s.id}
                    href={s.url}
                    aria-label={SOCIAL_PLATFORMS[s.platform]}
                    {...(s.url.startsWith("https://")
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="rounded-full border border-cream/25 p-2 text-cream/80 transition-colors hover:border-sage hover:text-sage"
                  >
                    <SocialIcon platform={s.platform} />
                  </a>
                ))}
              </div>
            ) : null}
            <div className="mt-6 space-y-1 text-sm text-cream/75">
              {contact.address ? <p>{contact.address}</p> : null}
              {contact.email || contact.phone ? (
                <p>
                  {contact.email ? (
                    <a
                      href={`mailto:${contact.email}`}
                      className="transition-colors hover:text-cream"
                    >
                      {contact.email}
                    </a>
                  ) : null}
                  {contact.email && contact.phone ? " · " : null}
                  {contact.phone ? (
                    <a
                      href={phoneHref(contact.phone, contact.phoneDial)}
                      className="transition-colors hover:text-cream"
                    >
                      {contact.phone}
                    </a>
                  ) : null}
                </p>
              ) : null}
              {contact.hours ? <p>{contact.hours}</p> : null}
            </div>
          </div>
          {footer.columns.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-sage">
                {col.heading}
              </p>
              <ul className="space-y-3 text-sm">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-cream/75 transition-colors hover:text-cream"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-cream/15 pt-6 text-xs text-cream/60 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {footer.copyright}
          </p>
          <div className="flex gap-6">
            {footer.legal.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="transition-colors hover:text-cream"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
