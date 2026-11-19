import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { Collection } from "@/lib/types";

/** Collection tile used on the home page and the collections index. Markup is the locked design. */
export default function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <Link
      href={`/collections/${collection.slug}`}
      className="group relative overflow-hidden rounded-2xl bg-sand shadow-sm ring-1 ring-border/60"
    >
      <Image
        src={collection.image}
        alt={collection.name}
        width={800}
        height={1000}
        sizes="(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
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
  );
}
