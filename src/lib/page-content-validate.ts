import { z } from "zod";

import { safeHref } from "@/lib/rich-text/parse";
import { pageDef, type FieldDef, type PageDef, type PageValues } from "@/lib/page-content";
import { configureZodForBrowser } from "@/lib/zod-browser";

configureZodForBrowser();

const ALLOWED_IMAGE_HOSTS = ["cdn.shopify.com"];

/** Pictures come from this site's own /images folder or the media library (Shopify's CDN), never an arbitrary host. */
export function validImageSrc(value: string): boolean {
  if (/^\/images\/[A-Za-z0-9._\-/]+$/.test(value) && !value.includes("..")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.includes(url.hostname) && !url.username;
  } catch {
    return false;
  }
}

const noControl = (value: string) => ![...value].some((c) => c.charCodeAt(0) < 32 && c !== "\n");
const str = (max: number, optional: boolean) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(noControl, "Remove special characters")
    .refine((v) => optional || v.length > 0, "Required");

const href = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (v) => safeHref(v) !== null,
    "Use a web address, a path like /shop, #section, mailto: or tel:",
  );

function fieldSchema(def: FieldDef): z.ZodType {
  switch (def.kind) {
    case "text":
    case "textarea":
      return str(def.max, def.optional ?? false);
    case "link":
      return z.object({ label: str(60, false), href });
    case "image":
      return z.object({
        src: z
          .string()
          .trim()
          .max(2048)
          .refine(validImageSrc, "Choose a picture from the media library"),
        alt: str(200, true),
      });
    case "list":
      return z.array(str(def.itemMax, false)).max(def.maxItems);
    case "cards":
      return z
        .array(z.object({ title: str(80, false), text: str(300, false) }))
        .min(1)
        .max(def.maxItems);
    case "quotes":
      return z
        .array(z.object({ quote: str(400, false), name: str(60, false), location: str(60, true) }))
        .min(1)
        .max(def.maxItems);
  }
}

/** A strict validator for one page's values: only known sections and fields, each checked by its kind. */
export function pageValuesSchema(page: PageDef): z.ZodType<PageValues> {
  const sections = Object.fromEntries(
    page.sections.map((s) => [
      s.id,
      z
        .object(Object.fromEntries(Object.entries(s.fields).map(([id, f]) => [id, fieldSchema(f)])))
        .strict(),
    ]),
  );
  return z.object(sections).strict() as unknown as z.ZodType<PageValues>;
}

export function validatePageValues(pageId: string, input: unknown) {
  const page = pageDef(pageId);
  if (!page) return null;
  return pageValuesSchema(page).safeParse(input);
}
