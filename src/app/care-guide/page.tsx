import type { Metadata } from "next";
import Link from "next/link";

import ContentShell from "@/components/content/ContentShell";
import { proseClass } from "@/components/content/prose";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Plant care guide — Fernwood",
  description:
    "Light, watering, soil and troubleshooting basics for houseplants and succulents, from the Fernwood growers.",
  alternates: { canonical: "/care-guide" },
};

export default function CareGuidePage() {
  return (
    <ContentShell
      eyebrow="Care library"
      title="Plant care guide"
      intro="Five habits that keep most houseplants happy. Every plant ships with its own care card, so use this as the general picture."
    >
      <div className={proseClass}>
        <h2>1. Get the light right</h2>
        <p>
          Light is the biggest factor in plant health. <strong>Bright, indirect light</strong> means
          a spot near a window where the plant sees plenty of sky but the sun doesn&apos;t hit the
          leaves for hours. <strong>Medium light</strong> is a few steps back from a window.{" "}
          <strong>Low light</strong> tolerates a dimmer room, but even tough plants grow slowly
          there. Succulents and cacti want <strong>full sun</strong>: the brightest window you have.
        </p>
        <p>
          Turn pots a quarter turn every week or two so growth stays even, and move plants gradually
          if you change their light, since sudden jumps scorch leaves.
        </p>

        <h2>2. Water when the plant needs it, not on a schedule</h2>
        <p>
          Check the soil with a finger. For most foliage plants, water when the top few centimetres
          are dry; for succulents and cacti, wait until the soil is dry all the way through. Water
          thoroughly until it drains out of the bottom, then empty the saucer. Overwatering kills
          far more plants than forgetting does.
        </p>
        <ul>
          <li>Yellowing lower leaves and soft stems usually mean too much water.</li>
          <li>Crispy brown edges and drooping often mean too little water or very dry air.</li>
          <li>Use room-temperature water, and water less in winter when growth slows.</li>
        </ul>

        <h2>3. Pots need drainage</h2>
        <p>
          A pot with drainage holes lets excess water escape so roots don&apos;t sit wet. If you
          love a pot without holes, keep the plant in a plain nursery pot and slip it inside as a
          cover pot, lifting it out to water.
        </p>

        <h2>4. Feed lightly in the growing season</h2>
        <p>
          From spring to early autumn, a balanced houseplant fertiliser at half the label strength
          every month or so is plenty. Skip feeding in winter, and never fertilise a dry or stressed
          plant.
        </p>

        <h2>5. Repot when roots run out of room</h2>
        <p>
          Roots circling the pot or poking out of the drainage holes mean it&apos;s time for a pot
          one size up. Spring is the best moment. Use fresh, free-draining mix and water well
          afterwards.
        </p>

        <h2>Troubleshooting</h2>
        <ul>
          <li>
            <strong>Leaves dropping after arrival:</strong> a little shedding is normal while the
            plant adjusts to new light. Keep conditions steady and don&apos;t move it around.
          </li>
          <li>
            <strong>Tiny insects or sticky leaves:</strong> isolate the plant, wipe the leaves, and
            treat with insecticidal soap. Check again after a week.
          </li>
          <li>
            <strong>Leggy, stretching growth:</strong> it needs more light.
          </li>
        </ul>
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-3 rounded-2xl bg-sage-light/50 p-6">
        <p className="mr-auto font-display text-lg text-forest">Still stuck with a plant?</p>
        <Button asChild className="h-11 px-7">
          <Link href="/contact">Ask a grower</Link>
        </Button>
      </div>
    </ContentShell>
  );
}
