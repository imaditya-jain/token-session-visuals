import Image from "next/image";

/** Collection/shop banner with the organic wave, like the reference theme. */
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
    <section className="relative">
      <div className="relative h-[360px] w-full overflow-hidden sm:h-[440px]">
        <Image
          src={image}
          alt={title}
          sizes="100vw"
          className="absolute inset-0 h-full w-full object-cover"
          width={800}
          height={1000}
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-forest-deep/25 via-transparent to-forest-deep/25" />

        <svg
          className="absolute bottom-0 left-0 z-10 h-12 w-full text-background sm:h-16"
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center">
        <div className="translate-y-1/3 rounded-2xl bg-forest px-8 py-5 text-center shadow-lg sm:px-12 sm:py-6">
          <h1 className="font-display text-3xl font-medium text-cream sm:text-5xl">{title}</h1>
          <p className="mt-1 text-sm text-cream/85">{tagline}</p>
        </div>
      </div>
    </section>
  );
}
