import { testimonials } from "@/data/site";

/**
 * The editable content of the storefront, page by page and section by section. Every field carries the text, link
 * or picture the site shows today as its `default`, so a page looks exactly as before until someone publishes a
 * change, and a field that is missing or invalid in the database simply falls back to its default.
 */

export type LinkValue = { label: string; href: string };
export type ImageValue = { src: string; alt: string };
export type CardValue = { title: string; text: string };
export type QuoteValue = { quote: string; name: string; location: string };
export type FieldValue = string | LinkValue | ImageValue | string[] | CardValue[] | QuoteValue[];

export type FieldDef =
  | { kind: "text"; label: string; max: number; default: string; optional?: boolean }
  | { kind: "textarea"; label: string; max: number; default: string; optional?: boolean }
  | { kind: "link"; label: string; default: LinkValue }
  | { kind: "image"; label: string; default: ImageValue }
  | { kind: "list"; label: string; maxItems: number; itemMax: number; default: string[] }
  | { kind: "cards"; label: string; maxItems: number; default: CardValue[] }
  | { kind: "quotes"; label: string; maxItems: number; default: QuoteValue[] };

export type SectionDef = { id: string; label: string; fields: Record<string, FieldDef> };
export type PageDef = { id: string; title: string; path: string; sections: SectionDef[] };

/** section id -> field id -> value */
export type PageValues = Record<string, Record<string, FieldValue>>;

const text = (label: string, def: string, max = 120, optional = false): FieldDef => ({
  kind: "text",
  label,
  max,
  default: def,
  optional,
});
const area = (label: string, def: string, max = 600): FieldDef => ({
  kind: "textarea",
  label,
  max,
  default: def,
});
const link = (label: string, def: LinkValue): FieldDef => ({ kind: "link", label, default: def });
const image = (label: string, def: ImageValue): FieldDef => ({
  kind: "image",
  label,
  default: def,
});

const HOME: PageDef = {
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
      id: "collections",
      label: "Collections heading",
      fields: {
        title: text("Heading", "Shop house plants", 80),
        description: area(
          "Text",
          "Curated collections for every corner — from sun-drenched shelves to cozy low-light nooks.",
          240,
        ),
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

export const PAGES: readonly PageDef[] = [HOME];

export const pageDef = (id: string): PageDef | undefined => PAGES.find((p) => p.id === id);

export const isPageId = (id: string): boolean => pageDef(id) !== undefined;

/** The defaults of one page, in the same shape as the stored values. */
export function defaultValues(page: PageDef): PageValues {
  return Object.fromEntries(
    page.sections.map((s) => [
      s.id,
      Object.fromEntries(Object.entries(s.fields).map(([id, f]) => [id, f.default])),
    ]),
  );
}

/**
 * Stored values over the defaults, field by field: a field that is missing keeps its default, so adding a new field
 * to a section never breaks pages that were published earlier.
 */
export function mergeValues(page: PageDef, stored: unknown): PageValues {
  const base = defaultValues(page);
  if (!stored || typeof stored !== "object") return base;
  const source = stored as Record<string, Record<string, FieldValue> | undefined>;
  for (const section of page.sections) {
    const fromStore = source[section.id];
    if (!fromStore || typeof fromStore !== "object") continue;
    for (const fieldId of Object.keys(section.fields)) {
      const value = fromStore[fieldId];
      if (value !== undefined && base[section.id]) base[section.id]![fieldId] = value;
    }
  }
  return base;
}

// ---- Typed readers for the storefront -----------------------------------------------------------------------------------

function read<T extends FieldValue>(
  page: PageDef,
  values: PageValues,
  section: string,
  field: string,
  check: (v: unknown) => v is T,
): T {
  const value = values[section]?.[field];
  if (check(value)) return value;
  const fallback = page.sections.find((s) => s.id === section)?.fields[field]?.default;
  if (check(fallback)) return fallback;
  throw new Error(`Unknown content field ${section}.${field}`);
}

const isString = (v: unknown): v is string => typeof v === "string";
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isLink = (v: unknown): v is LinkValue =>
  isObj(v) && isString(v["label"]) && isString(v["href"]);
const isImage = (v: unknown): v is ImageValue =>
  isObj(v) && isString(v["src"]) && isString(v["alt"]);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const isCards = (v: unknown): v is CardValue[] =>
  Array.isArray(v) && v.every((c) => isObj(c) && isString(c["title"]) && isString(c["text"]));
const isQuotes = (v: unknown): v is QuoteValue[] =>
  Array.isArray(v) &&
  v.every(
    (c) => isObj(c) && isString(c["quote"]) && isString(c["name"]) && isString(c["location"]),
  );

export type Reader = {
  text: (section: string, field: string) => string;
  link: (section: string, field: string) => LinkValue;
  image: (section: string, field: string) => ImageValue;
  list: (section: string, field: string) => string[];
  cards: (section: string, field: string) => CardValue[];
  quotes: (section: string, field: string) => QuoteValue[];
};

export function reader(pageId: string, values: PageValues): Reader {
  const page = pageDef(pageId);
  if (!page) throw new Error(`Unknown page ${pageId}`);
  return {
    text: (s, f) => read(page, values, s, f, isString),
    link: (s, f) => read(page, values, s, f, isLink),
    image: (s, f) => read(page, values, s, f, isImage),
    list: (s, f) => read(page, values, s, f, isStrings),
    cards: (s, f) => read(page, values, s, f, isCards),
    quotes: (s, f) => read(page, values, s, f, isQuotes),
  };
}
