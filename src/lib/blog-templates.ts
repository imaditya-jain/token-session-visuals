import { z } from "zod";

/**
 * The page layouts a post can use. The choice is stored per post; each id maps to a component in
 * `components/blog/templates`. Adding a template = an entry here + a component + its case in `PostTemplate`.
 */
export const BLOG_TEMPLATES = {
  classic: {
    name: "Classic",
    description: "A single centred column under a wide hero image. Calm and easy to read.",
  },
  magazine: {
    name: "Magazine",
    description:
      "Wide hero with a sticky side panel for the author, categories, tags and more reading.",
  },
  editorial: {
    name: "Editorial",
    description:
      "A large serif headline on a coloured band and a narrow reading column. Best for essays.",
  },
  visual: {
    name: "Visual",
    description:
      "Full-bleed image first with the headline over it. Best for lookbooks and photo stories.",
  },
  guide: {
    name: "Guide",
    description:
      "Adds a table of contents from your headings and a related-products panel. Best for plant care.",
  },
} as const;

export type BlogTemplateId = keyof typeof BLOG_TEMPLATES;

export const BLOG_TEMPLATE_IDS = Object.keys(BLOG_TEMPLATES) as [
  BlogTemplateId,
  ...BlogTemplateId[],
];

export const blogTemplateSchema = z.enum(BLOG_TEMPLATE_IDS);

export const DEFAULT_BLOG_TEMPLATE: BlogTemplateId = "classic";
