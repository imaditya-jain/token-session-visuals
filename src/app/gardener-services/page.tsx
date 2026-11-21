import type { Metadata } from "next";

import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import { proseClass } from "@/components/content/prose";
import GardenerBooking from "@/components/gardener/GardenerBooking";
import { GARDENER_CITIES } from "@/lib/gardener-schemas";
import { getGardenerService } from "@/server/services/gardener";

/** The service is an ordinary Shopify product with Seal subscription plans, so the owner manages it in admin. */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Gardener services — Fernwood",
  description: "Book a Fernwood gardener for a single visit or on a regular schedule.",
  alternates: { canonical: "/gardener-services" },
};

export default async function GardenerServicesPage() {
  const service = await getGardenerService();
  const cities = GARDENER_CITIES.join(", ");

  return (
    <ContentShell
      eyebrow="Services"
      title="Gardener services"
      intro="Book a Fernwood gardener for a single visit, or keep your plants looked after on a regular schedule."
    >
      <div className={proseClass}>
        <p>
          We currently offer the service in {cities}. Choose a one-time visit or a monthly,
          fortnightly or weekly plan, tell us where and when, and add it to your cart.
        </p>
      </div>
      <div className="mt-8">
        {service ? (
          <GardenerBooking service={service} />
        ) : (
          <div className="rounded-2xl bg-card p-6 text-center shadow-sm ring-1 ring-border/60 sm:p-8">
            <p className="font-display text-xl text-forest">Booking opens soon</p>
            <p className="mt-2 text-sm text-muted-foreground">
              We are getting the gardener service ready. Ask us and we will let you know as soon as
              you can book.
            </p>
          </div>
        )}
      </div>
      <ContactCta title="Questions about a visit?" topic="Something else" label="Talk to us" />
    </ContentShell>
  );
}
