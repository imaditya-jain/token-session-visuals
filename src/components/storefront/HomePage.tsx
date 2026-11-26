import Header from "@/components/storefront/Header";
import Hero from "@/components/storefront/Hero";
import {
  BestSellers,
  Collections,
  Footer,
  GiftsTeaser,
  PlantFinderTeaser,
  PromoSplit,
  SeasonalBanner,
  StoryTestimonial,
  Testimonials,
  TrustBar,
  WhyUs,
} from "@/components/storefront/sections";
import Newsletter from "@/components/storefront/Newsletter";
import WelcomeIntro from "@/components/storefront/WelcomeIntro";
import { getSiteChrome } from "@/server/services/site-chrome-public";

export default async function HomePage() {
  const { newsletter } = await getSiteChrome();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <WelcomeIntro />
      <Header />
      <main>
        <Hero />
        <TrustBar />
        <Collections />
        <BestSellers />
        <PlantFinderTeaser />
        <GiftsTeaser />
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
