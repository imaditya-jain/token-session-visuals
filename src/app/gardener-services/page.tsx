import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import { proseClass } from "@/components/content/prose";
import GardenerBooking from "@/components/gardener/GardenerBooking";
import { GARDENER_CITIES } from "@/lib/gardener-schemas";
import { getGardenerService } from "@/server/services/gardener";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

/** The service is an ordinary Shopify product with Seal subscription plans, so the owner manages it in admin. */
export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("gardener-services", "/gardener-services");

export default async function GardenerServicesPage() {
  const [service, c] = await Promise.all([
    getGardenerService(),
    getPageContent("gardener-services"),
  ]);
  const cities = GARDENER_CITIES.join(", ");

  return (
    <ContentShell
      eyebrow={c.text("header", "eyebrow")}
      title={c.text("header", "title")}
      intro={c.text("header", "intro")}
    >
      <div className={proseClass}>
        <p>
          We currently offer the service in {cities}. {c.text("text", "content")}
        </p>
      </div>
      <div className="mt-8">
        {service ? (
          <GardenerBooking service={service} />
        ) : (
          <div className="rounded-2xl bg-card p-6 text-center shadow-sm ring-1 ring-border/60 sm:p-8">
            <p className="font-display text-xl text-forest">{c.text("soon", "title")}</p>
            <p className="mt-2 text-sm text-muted-foreground">{c.text("soon", "text")}</p>
          </div>
        )}
      </div>
      <ContactCta
        title={c.text("cta", "title")}
        topic="Something else"
        label={c.text("cta", "label")}
      />
    </ContentShell>
  );
}
