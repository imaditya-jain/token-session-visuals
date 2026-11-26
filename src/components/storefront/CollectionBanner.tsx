import { Sprout } from "lucide-react";
import Image from "next/image";

/**
 * Opening band shared by shop, collection, content and account pages: forest background with soft glows,
 * the title, and the page picture inside an arch on wide screens. The h1 lives here.
 */
export default function CollectionBanner({
  image,
  title,
  tagline,
}: {
  image: string;
  title: string;
  tagline: string;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-forest-deep text-cream">
      <Image src={image} alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
      {/* Overlay: keeps the title readable on any picture and ties it to the brand colour. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-forest-deep/95 via-forest-deep/75 to-forest-deep/35"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-forest-deep/70 via-transparent to-transparent"
      />
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-20 sm:px-6 sm:pb-32 sm:pt-28 lg:px-8">
        <div className="animate-rise text-center lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full bg-cream/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-sage ring-1 ring-cream/20 backdrop-blur-sm">
            <Sprout className="size-3.5" aria-hidden />
            {tagline}
          </p>
          <h1 className="mt-5 font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            {title}
          </h1>
        </div>
      </div>
      <svg
        className="absolute inset-x-0 bottom-0 z-10 h-8 w-full text-background sm:h-12"
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
        aria-hidden
        focusable="false"
      >
        <path
          d="M0,100 L0,60 C240,20 420,90 720,45 C1020,0 1200,80 1440,50 L1440,100 Z"
          fill="currentColor"
        />
      </svg>
    </section>
  );
}
