import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import ContentShell from "@/components/content/ContentShell";
import { proseClass } from "@/components/content/prose";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Our story — Fernwood",
  description:
    "Fernwood began as a single glasshouse on a family farm in 1962. Meet the growers behind every plant.",
  alternates: { canonical: "/about" },
};

const principles = [
  {
    title: "Nursery-grown quality",
    text: "Every plant is raised in our own greenhouses, never brokered from unknown sources.",
  },
  {
    title: "Arrive-alive guarantee",
    text: "Protective packaging and a 30-day guarantee. If it arrives unhappy, we replace it.",
  },
  {
    title: "Care that continues",
    text: "Photo check-ins, a detailed care card and horticulturists on chat for the life of your plant.",
  },
  {
    title: "Grown responsibly",
    text: "Peat-free soils, recycled packaging and integrated pest management instead of sprays.",
  },
];

export default function AboutPage() {
  return (
    <ContentShell eyebrow="Three generations of growers" title="Our story">
      <Image
        src="/images/story-nursery.jpg"
        alt="A Fernwood grower holding a tray of seedlings in the nursery"
        width={1200}
        height={900}
        sizes="(min-width: 768px) 768px, 100vw"
        priority
        className="aspect-[5/4] w-full rounded-2xl object-cover shadow-xl"
      />

      <h2 id="our-story" className="mt-10 font-display text-3xl font-medium text-forest">
        Three generations of growers, one shared obsession
      </h2>
      <div className={`${proseClass} mt-4`}>
        <p>
          Fernwood began as a single glasshouse on our family farm in 1962. Today we propagate over
          120 species across four nurseries, and every plant still passes through the hands of a
          grower before it ships.
        </p>
        <p>
          We believe a plant should arrive ready to thrive, not merely survive. That means honest
          sizing, healthy roots, and guidance that continues long after the box is opened.
        </p>
      </div>

      <h2 className="mb-6 mt-14 font-display text-2xl font-medium text-forest">
        What we stand for
      </h2>
      <dl className="grid gap-6 sm:grid-cols-2">
        {principles.map((item) => (
          <div key={item.title} className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60">
            <dt className="font-display text-lg font-medium text-forest">{item.title}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-12 flex flex-wrap gap-3">
        <Button asChild className="h-11 px-7">
          <Link href="/shop">Shop the greenhouse</Link>
        </Button>
        <Button asChild variant="outline" className="h-11 px-7">
          <Link href="/care-guide">Read the care guide</Link>
        </Button>
      </div>
    </ContentShell>
  );
}
