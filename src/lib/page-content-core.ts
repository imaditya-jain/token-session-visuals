/**
 * The editable content of the storefront, page by page and section by section. Every field carries the text, link
 * or picture the site shows today as its `default`, so a page looks exactly as before until someone publishes a
 * change, and a field that is missing or invalid in the database simply falls back to its default.
 */

export type LinkValue = { label: string; href: string };
export type ImageValue = { src: string; alt: string };
export type CardValue = { title: string; text: string };
export type QuoteValue = { quote: string; name: string; location: string };
/** The rich-text editor's own JSON. It is validated and normalised by `parseRichText` before it is ever rendered. */
export type EditorDoc = { type: "doc"; content: unknown[] };
export type FaqItem = { question: string; answer: string };
export type FaqGroup = { title: string; items: FaqItem[] };
export type FieldValue =
  string | LinkValue | ImageValue | string[] | CardValue[] | QuoteValue[] | EditorDoc | FaqGroup[];

export type FieldDef =
  | { kind: "text"; label: string; max: number; default: string; optional?: boolean }
  | { kind: "textarea"; label: string; max: number; default: string; optional?: boolean }
  | { kind: "link"; label: string; default: LinkValue }
  | { kind: "image"; label: string; default: ImageValue }
  | { kind: "list"; label: string; maxItems: number; itemMax: number; default: string[] }
  | { kind: "cards"; label: string; maxItems: number; default: CardValue[] }
  | { kind: "quotes"; label: string; maxItems: number; default: QuoteValue[] }
  | { kind: "richtext"; label: string; default: EditorDoc }
  | { kind: "faqs"; label: string; maxGroups: number; default: FaqGroup[] };

export type SectionDef = { id: string; label: string; fields: Record<string, FieldDef> };
export type PageDef = { id: string; title: string; path: string; sections: SectionDef[] };

/** section id -> field id -> value */
export type PageValues = Record<string, Record<string, FieldValue>>;

export const text = (label: string, def: string, max = 120, optional = false): FieldDef => ({
  kind: "text",
  label,
  max,
  default: def,
  optional,
});
export const area = (label: string, def: string, max = 600): FieldDef => ({
  kind: "textarea",
  label,
  max,
  default: def,
});
export const link = (label: string, def: LinkValue): FieldDef => ({
  kind: "link",
  label,
  default: def,
});
export const image = (label: string, def: ImageValue): FieldDef => ({
  kind: "image",
  label,
  default: def,
});

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

export function read<T extends FieldValue>(
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

export const richtext = (label: string, def: EditorDoc): FieldDef => ({
  kind: "richtext",
  label,
  default: def,
});
export const faqs = (label: string, def: FaqGroup[]): FieldDef => ({
  kind: "faqs",
  label,
  maxGroups: 8,
  default: def,
});

const isDoc = (v: unknown): v is EditorDoc =>
  isObj(v) && v["type"] === "doc" && Array.isArray(v["content"]);
const isFaqs = (v: unknown): v is FaqGroup[] =>
  Array.isArray(v) &&
  v.every(
    (g) =>
      isObj(g) &&
      isString(g["title"]) &&
      Array.isArray(g["items"]) &&
      g["items"].every((i) => isObj(i) && isString(i["question"]) && isString(i["answer"])),
  );

export type Reader = {
  text: (section: string, field: string) => string;
  link: (section: string, field: string) => LinkValue;
  image: (section: string, field: string) => ImageValue;
  list: (section: string, field: string) => string[];
  cards: (section: string, field: string) => CardValue[];
  quotes: (section: string, field: string) => QuoteValue[];
  doc: (section: string, field: string) => EditorDoc;
  faqs: (section: string, field: string) => FaqGroup[];
};

export function makeReader(page: PageDef, values: PageValues): Reader {
  return {
    text: (s, f) => read(page, values, s, f, isString),
    link: (s, f) => read(page, values, s, f, isLink),
    image: (s, f) => read(page, values, s, f, isImage),
    list: (s, f) => read(page, values, s, f, isStrings),
    cards: (s, f) => read(page, values, s, f, isCards),
    quotes: (s, f) => read(page, values, s, f, isQuotes),
    doc: (s, f) => read(page, values, s, f, isDoc),
    faqs: (s, f) => read(page, values, s, f, isFaqs),
  };
}
