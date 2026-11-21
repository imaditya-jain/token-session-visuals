import type { Metadata } from "next";

import ContentShell from "@/components/content/ContentShell";
import { proseClass } from "@/components/content/prose";
import WholesaleForm from "@/components/wholesale/WholesaleForm";

export const metadata: Metadata = {
  title: "Wholesale — Fernwood",
  description: "Apply for a Fernwood wholesale account for your business.",
  alternates: { canonical: "/wholesale" },
};

export default function Page() {
  return (
    <ContentShell
      eyebrow="Company"
      title="Wholesale"
      intro="Plants and pots for cafés, studios, florists and garden centres."
    >
      <div className={proseClass}>
        <p>
          Fernwood plants are nursery-grown in our own greenhouses, so we know exactly what we can
          supply and when. If you are planting up a business or reselling, apply below.
        </p>
        <p>
          We review every application and come back to you by email. Approved businesses are set up
          with a wholesale account, and we confirm pricing and terms with you directly.
        </p>
      </div>
      <div className="mt-8 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border/60 sm:p-8">
        <WholesaleForm />
      </div>
    </ContentShell>
  );
}
