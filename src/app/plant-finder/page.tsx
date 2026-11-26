import CollectionBanner from "@/components/storefront/CollectionBanner";
import Header from "@/components/storefront/Header";
import PlantFinder from "@/components/plant-finder/PlantFinder";
import { Footer } from "@/components/storefront/sections";
import { getProducts } from "@/data/catalog";
import { isPlant } from "@/lib/plant-finder";
import { getPageContent } from "@/server/services/page-content-public";
import { pageMetadata } from "@/server/services/page-meta";

/** Prebuilt and cached like the rest of the catalogue; the quiz itself runs in the browser. */
export const revalidate = 3600;

export const generateMetadata = () => pageMetadata("plant-finder", "/plant-finder");

export default async function PlantFinderPage() {
  const [products, c] = await Promise.all([getProducts(), getPageContent("plant-finder")]);
  const plants = products.filter(isPlant);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <CollectionBanner
          image="/images/seasonal-greenhouse.jpg"
          title={c.text("header", "title")}
          tagline={c.text("header", "eyebrow")}
        />
        <div className="mx-auto max-w-5xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8">
          <PlantFinder
            plants={plants}
            copy={{
              introTitle: c.text("intro", "title"),
              introText: c.text("intro", "text"),
              introButton: c.text("intro", "button"),
              resultTitle: c.text("result", "title"),
              retakeLabel: c.text("result", "retake"),
            }}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
