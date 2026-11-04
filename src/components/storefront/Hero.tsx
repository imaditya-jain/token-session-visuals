import { Link } from "@tanstack/react-router";
import heroImage from "@/assets/hero-plants.jpg";

export default function Hero() {
  return (
    <section className="relative">
      <div className="relative h-[78vh] min-h-[520px] w-full overflow-hidden sm:h-[82vh] lg:h-[88vh]">
        <img
          src={heroImage}
          alt="A table full of lush house plants in terracotta and cream pots"
          className="absolute inset-0 h-full w-full object-cover"
          width={1920}
          height={1080}
          fetchPriority="high"
        />
        {/* Soft scrim so text stays legible over the photo */}
        <div className="absolute inset-0 bg-gradient-to-b from-forest-deep/35 via-transparent to-forest-deep/20" />

        <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-cream/90 sm:text-sm">
            Nursery-grown · Delivered with care
          </p>
          <h1 className="max-w-3xl font-display text-5xl font-medium leading-[1.05] text-cream drop-shadow-sm sm:text-6xl lg:text-7xl">
            Let&apos;s go green!
          </h1>
          <p className="mt-5 max-w-xl text-base text-cream/95 sm:text-lg">
            Bring color and life to your home with plants straight from our
            greenhouse.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/collections/house-plants"
              className="inline-flex items-center justify-center rounded-md bg-cream px-7 py-3 text-sm font-semibold text-forest-deep shadow-md transition-all hover:bg-cream/90 hover:shadow-lg"
            >
              Shop indoor plants
            </Link>
            <Link
              to="/collections/succulents-cacti"
              className="inline-flex items-center justify-center rounded-md border border-cream/50 bg-cream/15 px-7 py-3 text-sm font-semibold text-cream backdrop-blur-sm transition-all hover:bg-cream/25"
            >
              Shop succulents
            </Link>
          </div>
        </div>

        {/* Organic curve into the cream canvas, like the reference */}
        <svg
          className="absolute bottom-0 left-0 z-10 h-14 w-full text-background sm:h-20"
          viewBox="0 0 1440 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M0,100 L0,60 C240,20 420,90 720,45 C1020,0 1200,80 1440,50 L1440,100 Z"
            fill="currentColor"
          />
        </svg>
      </div>
    </section>
  );
}
