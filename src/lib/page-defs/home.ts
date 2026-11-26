import { testimonials } from "@/data/site";
import { area, image, link, text, type PageDef } from "@/lib/page-content-core";

export const HOME: PageDef = {
  id: "home",
  title: "Home page",
  path: "/",
  sections: [
    {
      id: "hero",
      label: "Hero banner",
      fields: {
        image: image("Background picture", {
          src: "/images/hero-plants.jpg",
          alt: "A table full of lush house plants in terracotta and cream pots",
        }),
        eyebrow: text(
          "Small line above the heading",
          "Nursery-grown · Delivered with care",
          80,
          true,
        ),
        title: text("Heading", "Let's go green!", 80),
        subtitle: area(
          "Sub-heading",
          "Bring color and life to your home with plants straight from our greenhouse.",
          240,
        ),
        primaryCta: link("First button", {
          label: "Shop indoor plants",
          href: "/collections/house-plants",
        }),
        secondaryCta: link("Second button", {
          label: "Shop succulents",
          href: "/collections/succulents-cacti",
        }),
      },
    },
    {
      id: "trust",
      label: "Promise strip under the hero",
      fields: {
        items: {
          kind: "cards",
          label: "Promises (icons are chosen by position; leave empty to hide the strip)",
          maxItems: 4,
          default: [
            { title: "Free shipping", text: "On every order over $75" },
            { title: "30-day guarantee", text: "Arrives unhappy? We replace it" },
            { title: "Plastic-free packing", text: "Recycled, plant-safe materials" },
            { title: "Grown by us", text: "Raised in our own greenhouses" },
          ],
        },
      },
    },
    {
      id: "collections",
      label: "Collections slider",
      fields: {
        eyebrow: text("Small line above the heading", "", 60, true),
        title: text("Heading", "Shop house plants", 80),
        description: area(
          "Text",
          "Curated collections for every corner — from sun-drenched shelves to cozy low-light nooks.",
          240,
        ),
        cta: link("Button under the slider", {
          label: "View all collections",
          href: "/collections",
        }),
      },
    },
    {
      id: "finder",
      label: "Plant Finder teaser",
      fields: {
        eyebrow: text("Small line above the heading", "New: Plant Finder", 60, true),
        title: text("Heading", "Not sure which plant? Swipe your way to it", 100),
        text: area(
          "Text",
          "Answer a few quick questions about your space, then swipe through plants like the ones you love. In about a minute we'll show the plants that suit you best.",
          400,
        ),
        cta: link("Button", { label: "Find my plant", href: "/plant-finder" }),
        cardOne: image("Back card picture", {
          src: "/images/product-fiddle-fig.jpg",
          alt: "A fiddle-leaf fig in a pot",
        }),
        cardTwo: image("Middle card picture", {
          src: "/images/product-bird-of-paradise.jpg",
          alt: "A bird of paradise plant",
        }),
        cardThree: image("Front card picture", {
          src: "/images/product-monstera.jpg",
          alt: "A monstera with large split leaves",
        }),
      },
    },
    {
      id: "bestSellers",
      label: "Best sellers",
      fields: {
        eyebrow: text("Small line above the heading", "Loved by plant parents", 60, true),
        title: text("Heading", "Best sellers this season", 80),
        description: area(
          "Text",
          "Our most-loved greenery, shipped straight from the greenhouse in protective, plant-friendly packaging.",
          240,
        ),
        cta: link("Button", { label: "View all plants", href: "/collections/house-plants" }),
      },
    },
    {
      id: "promo",
      label: "Repotting promo",
      fields: {
        image: image("Picture", {
          src: "/images/promo-repotting.jpg",
          alt: "Hands repotting a plant into a terracotta pot",
        }),
        statValue: text("Highlight number", "120+", 12),
        statLabel: text("Highlight caption", "Species in our nursery", 40),
        eyebrow: text("Small line above the heading", "Repotting season", 60, true),
        title: text("Heading", "Everything your plants need to put down roots", 120),
        text: area(
          "Text",
          "From breathable terracotta to our chunky, well-draining houseplant mix, every Fernwood essential is tested in our own greenhouse before it ever reaches your shelf.",
        ),
        bullets: {
          kind: "list",
          label: "Bullet points",
          maxItems: 6,
          itemMax: 100,
          default: [
            "Hand-thrown pots with proper drainage",
            "Peat-free soil blends mixed in-house",
            "Step-by-step care card with every plant",
          ],
        },
        cta: link("Button", { label: "Shop pots & soil", href: "#collections" }),
      },
    },
    {
      id: "seasonal",
      label: "Seasonal banner",
      fields: {
        image: image("Background picture", {
          src: "/images/seasonal-greenhouse.jpg",
          alt: "Sunlit Victorian greenhouse filled with plants",
        }),
        eyebrow: text("Small line above the heading", "Featured collection", 60, true),
        title: text("Heading", "The Winter Greenhouse Edit", 80),
        text: area(
          "Text",
          "Statement plants that shrug off short days — plus our warmest grow-light picks for the darker months. Save up to 25% while the collection lasts.",
          400,
        ),
        cta: link("Button", { label: "Shop the edit", href: "#best-sellers" }),
        note: text(
          "Small print beside the button",
          "Ends Sunday · Free heat pack included",
          100,
          true,
        ),
      },
    },
    {
      id: "whyUs",
      label: "Why shop with us",
      fields: {
        eyebrow: text("Small line above the heading", "Why shop with us", 60, true),
        title: text("Heading", "From our greenhouse to your home", 80),
        perks: {
          kind: "cards",
          label: "Reasons (icons are chosen by position)",
          maxItems: 6,
          default: [
            {
              title: "Nursery-grown quality",
              text: "Every plant is raised in our own greenhouses, never brokered from unknown sources.",
            },
            {
              title: "Arrive-alive guarantee",
              text: "Protective packaging and a 30-day guarantee — if it arrives unhappy, we replace it.",
            },
            {
              title: "Care that continues",
              text: "Photo check-ins, a detailed care card and horticulturists on chat for the life of your plant.",
            },
            {
              title: "Grown responsibly",
              text: "Peat-free soils, recycled packaging and integrated pest management instead of sprays.",
            },
          ],
        },
      },
    },
    {
      id: "story",
      label: "Our story",
      fields: {
        eyebrow: text("Small line above the heading", "Our story", 60, true),
        title: text("Heading", "Three generations of growers, one shared obsession", 120),
        paragraph1: area(
          "First paragraph",
          "Fernwood began as a single glasshouse on our family farm in 1962. Today we propagate over 120 species across four nurseries — and every plant still passes through the hands of a grower before it ships.",
        ),
        paragraph2: area(
          "Second paragraph",
          "We believe a plant should arrive ready to thrive, not merely survive. That means honest sizing, healthy roots, and guidance that continues long after the box is opened.",
        ),
        cta: link("Button", { label: "Meet the growers", href: "/about" }),
        image: image("Picture", {
          src: "/images/story-nursery.jpg",
          alt: "A Fernwood grower holding a tray of seedlings in the nursery",
        }),
      },
    },
    {
      id: "testimonials",
      label: "Customer quotes",
      fields: {
        eyebrow: text("Small line above the heading", "Kind words", 60, true),
        title: text("Heading", "What plant parents say", 80),
        description: area(
          "Text",
          "Over 12,000 five-star reviews from homes and offices across the country.",
          240,
        ),
        quotes: {
          kind: "quotes",
          label: "Quotes",
          maxItems: 6,
          default: testimonials.map((t) => ({
            quote: t.quote,
            name: t.name,
            location: t.location,
          })),
        },
      },
    },
  ],
};
