import Header from "@/components/storefront/Header";
import Hero from "@/components/storefront/Hero";
import {
  BestSellers,
  Collections,
  Footer,
  Newsletter,
  PromoSplit,
  SeasonalBanner,
  StoryTestimonial,
  Testimonials,
  WhyUs,
} from "@/components/storefront/sections";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <Collections />
        <BestSellers />
        <PromoSplit />
        <SeasonalBanner />
        <WhyUs />
        <StoryTestimonial />
        <Testimonials />
        <Newsletter />
      </main>
      <Footer />
    </div>
  );
}
