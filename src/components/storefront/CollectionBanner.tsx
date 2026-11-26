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
      <div
        aria-hidden
        className="absolute -left-28 -top-20 -z-10 size-96 rounded-full bg-moss/30 blur-3xl"
      />
      <div
        aria-hidden
        className="absolute -bottom-24 right-10 -z-10 size-96 rounded-full bg-clay/15 blur-3xl"
      />
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-16 lg:grid-cols-[1.2fr_1fr] lg:px-8">
        <div className="animate-rise text-center lg:text-left">
          <p className="inline-flex items-center gap-2 rounded-full bg-cream/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-sage ring-1 ring-cream/15">
            <Sprout className="size-3.5" aria-hidden />
            {tagline}
          </p>
          <h1 className="mt-5 font-display text-4xl font-medium leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            {title}
          </h1>
        </div>
        <div className="relative mx-auto hidden h-60 w-full max-w-xs lg:block lg:max-w-sm">
          <div className="absolute inset-0 overflow-hidden rounded-t-[999px] rounded-b-3xl shadow-2xl ring-1 ring-cream/15">
            <Image src={image} alt="" fill sizes="384px" className="object-cover" />
          </div>
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
