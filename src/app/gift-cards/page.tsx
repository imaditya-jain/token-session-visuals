import ContactCta from "@/components/content/ContactCta";
import ContentShell from "@/components/content/ContentShell";
import ProductCard from "@/components/storefront/ProductCard";
import { getShopPage } from "@/data/catalog";
import { parseShopQuery } from "@/lib/shop";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

/** Gift cards are ordinary Shopify products of type "Gift Card", so the merchant manages them in admin. */
export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("gift-cards", "/gift-cards");

export default async function GiftCardsPage() {
  const [{ products }, c] = await Promise.all([
    getShopPage(parseShopQuery({ type: "Gift Card" })),
    getPageContent("gift-cards"),
  ]);

  return (
    <ContentShell
      eyebrow={c.text("header", "eyebrow")}
      title={c.text("header", "title")}
      intro={c.text("header", "intro")}
    >
      {products.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-card p-6 text-center shadow-sm ring-1 ring-border/60 sm:p-8">
          <p className="font-display text-xl text-forest">{c.text("soon", "title")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{c.text("soon", "text")}</p>
        </div>
      )}
      <ContactCta
        title={c.text("cta", "title")}
        topic="Something else"
        label={c.text("cta", "label")}
      />
    </ContentShell>
  );
}
