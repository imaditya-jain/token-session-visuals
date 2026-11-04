import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { bestSellers, collections, formatPrice, testimonials } from "@/data/catalog";
import ProductCard from "@/components/storefront/ProductCard";
import promoImage from "@/assets/promo-repotting.jpg";
import seasonalImage from "@/assets/seasonal-greenhouse.jpg";
import storyImage from "@/assets/story-nursery.jpg";
import {
  Truck,
  Leaf,
  HeartHandshake,
  Sprout,
  Star,
  Quote,
  Instagram,
  Facebook,
  Twitter,
  Youtube,
} from "lucide-react";

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

export function Collections() {
  return (
    <section id="collections" className="mx-auto max-w-7xl px-4 pb-20 pt-14 sm:px-6 lg:px-8 lg:pb-28">
      <SectionHeading
        title="Shop house plants"
        description="Curated collections for every corner — from sun-drenched shelves to cozy low-light nooks."
      />
      <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
        {collections.map((collection) => (
          <Link
            key={collection.slug}
            to="/collections/$slug"
            params={{ slug: collection.slug }}
            className="group relative overflow-hidden rounded-2xl bg-sand shadow-sm ring-1 ring-border/60"
          >
            <img
              src={collection.image}
              alt={collection.name}
              loading="lazy"
              width={800}
              height={1000}
              className="aspect-[4/5] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-forest-deep/70 via-transparent to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
              <h3 className="font-display text-lg font-medium text-cream sm:text-xl">
                {collection.name}
              </h3>
              <p className="mt-0.5 text-xs text-cream/85 sm:text-sm">{collection.tagline}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-cream opacity-90 transition-all group-hover:gap-2">
                Explore <ArrowRight className="size-3.5" aria-hidden />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function BestSellers() {
  return (
    <section id="best-sellers" className="bg-sage-light/60 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Loved by plant parents"
          title="Best sellers this season"
          description="Our most-loved greenery, shipped straight from the greenhouse in protective, plant-friendly packaging."
        />
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {bestSellers.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            to="/collections/house-plants"
            className="inline-flex items-center gap-2 rounded-md border border-forest bg-transparent px-7 py-3 text-sm font-semibold text-forest transition-colors hover:bg-forest hover:text-cream"
          >
            View all plants <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function PromoSplit() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="relative order-2 lg:order-1">
          <img
            src={promoImage}
            alt="Hands repotting a plant into a terracotta pot"
            loading="lazy"
            width={1200}
            height={900}
            className="aspect-[5/4] w-full rounded-2xl object-cover shadow-md"
          />
          <div className="absolute -bottom-5 left-6 hidden rounded-xl bg-forest px-6 py-4 text-cream shadow-lg sm:block">
            <p className="font-display text-2xl">120+</p>
            <p className="text-xs uppercase tracking-wider text-sage">Species in our nursery</p>
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-clay">
            Repotting season
          </p>
          <h2 className="font-display text-3xl font-medium text-forest sm:text-4xl">
            Everything your plants need to put down roots
          </h2>
          <p className="mt-5 leading-relaxed text-muted-foreground">
            From breathable terracotta to our chunky, well-draining houseplant
            mix, every Fernwood essential is tested in our own greenhouse
            before it ever reaches your shelf.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-foreground/90">
            {[
              "Hand-thrown pots with proper drainage",
              "Peat-free soil blends mixed in-house",
              "Step-by-step care card with every plant",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <Sprout className="mt-0.5 size-4 shrink-0 text-clay" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <a
            href="#collections"
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-forest px-7 py-3 text-sm font-semibold text-cream transition-colors hover:bg-forest-deep"
          >
            Shop pots & soil <ArrowRight className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}

export function SeasonalBanner() {
  return (
    <section className="relative overflow-hidden">
      <img
        src={seasonalImage}
        alt="Sunlit Victorian greenhouse filled with plants"
        loading="lazy"
        width={1600}
        height={900}
        className="h-[480px] w-full object-cover sm:h-[560px]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-forest-deep/70 via-forest-deep/30 to-transparent" />
      <div className="absolute inset-0 flex items-center">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-lg rounded-2xl bg-cream/92 p-8 shadow-xl backdrop-blur-sm sm:p-10">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-clay">
              Featured collection
            </p>
            <h2 className="font-display text-3xl font-medium text-forest sm:text-4xl">
              The Winter Greenhouse Edit
            </h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Statement plants that shrug off short days — plus our warmest
              grow-light picks for the darker months. Save up to 25% while the
              collection lasts.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="#best-sellers"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-clay px-7 py-3 text-sm font-semibold text-cream transition-colors hover:bg-clay-deep"
              >
                Shop the edit <ArrowRight className="size-4" aria-hidden />
              </a>
              <p className="text-xs text-muted-foreground">
                Ends Sunday · Free heat pack included
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const perks = [
  {
    icon: Leaf,
    title: "Nursery-grown quality",
    text: "Every plant is raised in our own greenhouses, never brokered from unknown sources.",
  },
  {
    icon: Truck,
    title: "Arrive-alive guarantee",
    text: "Protective packaging and a 30-day guarantee — if it arrives unhappy, we replace it.",
  },
  {
    icon: HeartHandshake,
    title: "Care that continues",
    text: "Photo check-ins, a detailed care card and horticulturists on chat for the life of your plant.",
  },
  {
    icon: Sprout,
    title: "Grown responsibly",
    text: "Peat-free soils, recycled packaging and integrated pest management instead of sprays.",
  },
];

export function WhyUs() {
  return (
    <section id="our-story" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <SectionHeading
        eyebrow="Why shop with us"
        title="From our greenhouse to your home"
      />
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {perks.map((perk) => (
          <div
            key={perk.title}
            className="rounded-2xl bg-card p-7 shadow-sm ring-1 ring-border/60 transition-shadow hover:shadow-md"
          >
            <div className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-sage-light text-forest">
              <perk.icon className="size-6" aria-hidden />
            </div>
            <h3 className="font-display text-lg font-medium text-forest">{perk.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{perk.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function StoryTestimonial() {
  return (
    <section className="bg-forest text-cream">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-28">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-sage">
            Our story
          </p>
          <h2 className="font-display text-3xl font-medium sm:text-4xl">
            Three generations of growers, one shared obsession
          </h2>
          <p className="mt-5 leading-relaxed text-cream/85">
            Fernwood began as a single glasshouse on our family farm in 1962.
            Today we propagate over 120 species across four nurseries — and
            every plant still passes through the hands of a grower before it
            ships.
          </p>
          <p className="mt-4 leading-relaxed text-cream/85">
            We believe a plant should arrive ready to thrive, not merely
            survive. That means honest sizing, healthy roots, and guidance
            that continues long after the box is opened.
          </p>
          <a
            href="#footer"
            className="mt-8 inline-flex items-center gap-2 rounded-md border border-cream/50 px-7 py-3 text-sm font-semibold text-cream transition-colors hover:bg-cream/10"
          >
            Meet the growers <ArrowRight className="size-4" aria-hidden />
          </a>
        </div>
        <img
          src={storyImage}
          alt="A Fernwood grower holding a tray of seedlings in the nursery"
          loading="lazy"
          width={1200}
          height={900}
          className="aspect-[5/4] w-full rounded-2xl object-cover shadow-xl"
        />
      </div>
    </section>
  );
}

export function Testimonials() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <SectionHeading
        eyebrow="Kind words"
        title="What plant parents say"
        description="Over 12,000 five-star reviews from homes and offices across the country."
      />
      <div className="grid gap-6 md:grid-cols-3">
        {testimonials.map((t) => (
          <figure
            key={t.name}
            className="flex flex-col rounded-2xl bg-card p-7 shadow-sm ring-1 ring-border/60"
          >
            <Quote className="mb-4 size-7 text-clay/60" aria-hidden />
            <div className="mb-3 flex gap-0.5" aria-label="5 out of 5 stars">
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
    </section>
  );
}

export function Newsletter() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
      <div className="overflow-hidden rounded-3xl bg-forest px-6 py-14 text-center text-cream sm:px-12 lg:py-16">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-sage">
          Join the greenhouse club
        </p>
        <h2 className="mx-auto max-w-xl font-display text-3xl font-medium sm:text-4xl">
          Get 10% off your first order
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-sm text-cream/85">
          Seasonal care tips, early access to rare drops and members-only
          savings — one thoughtful email a month, never spam.
        </p>
        <form
          className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
          onSubmit={(e) => e.preventDefault()}
        >
          <label className="sr-only" htmlFor="newsletter-email">
            Email address
          </label>
          <input
            id="newsletter-email"
            type="email"
            required
            placeholder="you@example.com"
            className="w-full flex-1 rounded-md border border-cream/25 bg-cream/10 px-4 py-3 text-sm text-cream outline-none transition-colors placeholder:text-cream/50 focus:border-sage"
          />
          <button
            type="submit"
            className="rounded-md bg-cream px-6 py-3 text-sm font-semibold text-forest-deep transition-colors hover:bg-cream/90"
          >
            Subscribe
          </button>
        </form>
        <p className="mt-4 text-xs text-cream/60">Unsubscribe anytime. No green thumb required.</p>
      </div>
    </section>
  );
}

const footerColumns = [
  {
    heading: "Shop",
    links: ["House Plants", "Succulents & Cacti", "Pots & Planters", "Seeds & Tools", "Gift Cards"],
  },
  {
    heading: "Company",
    links: ["Our Story", "Careers", "Wholesale", "Sustainability", "Press"],
  },
  {
    heading: "Help",
    links: ["Shipping & Delivery", "Plant Guarantee", "Care Library", "FAQs", "Contact Us"],
  },
];

export function Footer() {
  return (
    <footer id="footer" className="bg-forest-deep text-cream">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="font-display text-3xl font-medium">Fernwood</p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-cream/75">
              Premium nursery-grown plants, handmade pots and honest advice —
              helping homes go green since 1962.
            </p>
            <div className="mt-6 flex gap-3">
              {[
                { icon: Instagram, label: "Instagram" },
                { icon: Facebook, label: "Facebook" },
                { icon: Twitter, label: "Twitter" },
                { icon: Youtube, label: "YouTube" },
              ].map((s) => (
                <a
                  key={s.label}
                  href="#footer"
                  aria-label={s.label}
                  className="rounded-full border border-cream/25 p-2 text-cream/80 transition-colors hover:border-sage hover:text-sage"
                >
                  <s.icon className="size-4" aria-hidden />
                </a>
              ))}
            </div>
            <div className="mt-6 space-y-1 text-sm text-cream/75">
              <p>1234 Greenhouse Lane, Portland, OR 97210</p>
              <p>hello@fernwood.shop · (503) 555-0142</p>
              <p>Mon–Sat, 9am–6pm PST</p>
            </div>
          </div>
          {footerColumns.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-sage">
                {col.heading}
              </p>
              <ul className="space-y-3 text-sm">
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#footer" className="text-cream/75 transition-colors hover:text-cream">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-cream/15 pt-6 text-xs text-cream/60 sm:flex-row">
          <p>© {new Date().getFullYear()} Fernwood Nursery Co. All rights reserved.</p>
          <div className="flex gap-6">
            <a href="#footer" className="transition-colors hover:text-cream">
              Privacy Policy
            </a>
            <a href="#footer" className="transition-colors hover:text-cream">
              Terms of Service
            </a>
            <a href="#footer" className="transition-colors hover:text-cream">
              Accessibility
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
