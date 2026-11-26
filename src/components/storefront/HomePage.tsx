import Header from "@/components/storefront/Header";
import Hero from "@/components/storefront/Hero";
import {
  BestSellers,
  Collections,
  Footer,
  PlantFinderTeaser,
  PromoSplit,
  SeasonalBanner,
  StoryTestimonial,
  Testimonials,
  TrustBar,
  WhyUs,
} from "@/components/storefront/sections";
import Newsletter from "@/components/storefront/Newsletter";
import { getSiteChrome } from "@/server/services/site-chrome-public";

export default async function HomePage() {
  const { newsletter } = await getSiteChrome();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <TrustBar />
        <Collections />
        <BestSellers />
        <PlantFinderTeaser />
        <PromoSplit />
        <SeasonalBanner />
        <WhyUs />
        <StoryTestimonial />
        <Testimonials />
        <Newsletter content={newsletter} />
      </main>
      <Footer />
    </div>
  );
}
