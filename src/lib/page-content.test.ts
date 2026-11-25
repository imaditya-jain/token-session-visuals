import { describe, expect, it } from "vitest";

import { PAGES, defaultValues, mergeValues, reader } from "./page-content";
import { validatePageValues, validImageSrc } from "./page-content-validate";
import { parseRichText } from "./rich-text/parse";
import { renderRichText } from "./rich-text/render";

describe("editable pages", () => {
  it("has unique ids and paths that start with a slash", () => {
    expect(new Set(PAGES.map((p) => p.id)).size).toBe(PAGES.length);
    for (const page of PAGES) expect(page.path.startsWith("/")).toBe(true);
  });

  for (const page of PAGES) {
    it(`${page.id}: the built-in defaults pass their own validation`, () => {
      const result = validatePageValues(page.id, defaultValues(page));
      expect(
        result?.success,
        JSON.stringify(result && !result.success ? result.error.issues : []),
      ).toBe(true);
    });

    it(`${page.id}: every field can be read back`, () => {
      const read = reader(page.id, defaultValues(page));
      for (const section of page.sections) {
        for (const [id, field] of Object.entries(section.fields)) {
          const get = {
            text: read.text,
            textarea: read.text,
            link: read.link,
            image: read.image,
            list: read.list,
            cards: read.cards,
            quotes: read.quotes,
            richtext: read.doc,
            faqs: read.faqs,
          }[field.kind];
          expect(() => get(section.id, id)).not.toThrow();
        }
      }
    });
  }

  it("rich text defaults render to HTML", () => {
    const care = PAGES.find((p) => p.id === "care-guide")!;
    const html = renderRichText(
      parseRichText(reader("care-guide", defaultValues(care)).doc("body", "content")),
    ).html;
    expect(html).toContain("<h2");
    expect(html).toContain("<strong>Bright, indirect light</strong>");
    expect(html).toContain("<li>");
  });

  it("a missing or broken stored field falls back to its default", () => {
    const home = PAGES[0]!;
    const merged = mergeValues(home, { hero: { title: "Hello" } });
    expect(merged["hero"]?.["title"]).toBe("Hello");
    expect(merged["hero"]?.["subtitle"]).toBe(defaultValues(home)["hero"]?.["subtitle"]);
  });

  it("only this site's pictures and the media library are accepted", () => {
    expect(validImageSrc("/images/hero-plants.jpg")).toBe(true);
    expect(validImageSrc("https://cdn.shopify.com/s/files/1/x.jpg")).toBe(true);
    expect(validImageSrc("https://evil.example/x.jpg")).toBe(false);
    expect(validImageSrc("/images/../secret")).toBe(false);
    expect(validImageSrc("javascript:alert(1)")).toBe(false);
  });

  it("refuses unknown sections and unsafe links", () => {
    const home = PAGES[0]!;
    const values = defaultValues(home);
    expect(validatePageValues("home", { ...values, extra: {} })?.success).toBe(false);
    const bad = structuredClone(values);
    (bad["hero"] as Record<string, unknown>)["primaryCta"] = {
      label: "x",
      href: "javascript:alert(1)",
    };
    expect(validatePageValues("home", bad)?.success).toBe(false);
  });
});
