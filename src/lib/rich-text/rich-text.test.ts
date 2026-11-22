import { describe, expect, it } from "vitest";

import { slugify } from "@/lib/slug";

import {
  autoExcerpt,
  documentText,
  LIMITS,
  parseRichText,
  readingMinutes,
  renderRichText,
  richTextSchema,
  RichTextError,
  safeHref,
  safeImageSrc,
} from ".";

const text = (value: string, marks?: unknown[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});
const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (...inline: unknown[]) => ({ type: "paragraph", content: inline });
const IMG = "https://cdn.shopify.com/s/files/1/0001/fern.jpg";

describe("parseRichText: what is accepted", () => {
  it("accepts every supported node and normalises the result", () => {
    const parsed = parseRichText(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [text("Light")] },
        p(text("Bright "), text("indirect", [{ type: "bold" }, { type: "italic" }]), {
          type: "hardBreak",
        }),
        { type: "bulletList", content: [{ type: "listItem", content: [p(text("one"))] }] },
        { type: "orderedList", content: [{ type: "listItem", content: [p(text("two"))] }] },
        { type: "blockquote", content: [p(text("quote"))] },
        { type: "codeBlock", content: [text("npm run dev")] },
        { type: "horizontalRule" },
        {
          type: "image",
          attrs: { src: IMG, alt: "A fern", width: 800, height: 600, title: "dropped" },
        },
      ),
    );
    expect(parsed.content).toHaveLength(8);
    expect(parsed.content[7]).toEqual({
      type: "image",
      src: IMG,
      alt: "A fern",
      width: 800,
      height: 600,
    });
  });

  it("gives an empty document one empty paragraph so the editor always has a block", () => {
    expect(parseRichText(doc())).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("drops attributes it doesn't know instead of storing them", () => {
    const parsed = parseRichText(
      doc({
        type: "heading",
        attrs: { level: 3, onclick: "x()", class: "evil" },
        content: [text("A")],
      }),
    );
    expect(JSON.stringify(parsed)).not.toMatch(/onclick|evil/);
  });
});

describe("parseRichText: what is refused", () => {
  const bad = (name: string, input: unknown) =>
    it(`rejects ${name}`, () => expect(() => parseRichText(input)).toThrow(RichTextError));

  bad("a non-document", { type: "paragraph" });
  bad("null", null);
  bad("an array", []);
  bad("an unknown block type", doc({ type: "script", content: [] }));
  bad("an iframe-like embed", doc({ type: "iframe", attrs: { src: "https://evil.example" } }));
  bad("an unknown mark", doc(p(text("x", [{ type: "highlight" }]))));
  bad(
    "a javascript: link",
    doc(p(text("x", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]))),
  );
  bad(
    "a data: link",
    doc(p(text("x", [{ type: "link", attrs: { href: "data:text/html,<script>" } }]))),
  );
  bad(
    "a protocol-relative link",
    doc(p(text("x", [{ type: "link", attrs: { href: "//evil.example" } }]))),
  );
  bad("a link with no address", doc(p(text("x", [{ type: "link", attrs: {} }]))));
  bad(
    "an image from another host",
    doc({ type: "image", attrs: { src: "https://evil.example/a.png" } }),
  );
  bad("an http image", doc({ type: "image", attrs: { src: "http://cdn.shopify.com/a.png" } }));
  bad("a data: image", doc({ type: "image", attrs: { src: "data:image/png;base64,AAAA" } }));
  bad(
    "an image with credentials in the URL",
    doc({ type: "image", attrs: { src: "https://user:pw@cdn.shopify.com/a.png" } }),
  );
  bad("a heading level 1", doc({ type: "heading", attrs: { level: 1 }, content: [text("A")] }));
  bad("a heading level 7", doc({ type: "heading", attrs: { level: 7 }, content: [text("A")] }));
  bad("empty text nodes", doc(p({ type: "text", text: "" })));
  bad("a block inside inline content", doc(p({ type: "paragraph" })));
  bad("an empty list", doc({ type: "bulletList", content: [] }));
  bad("a list holding a non-item", doc({ type: "bulletList", content: [p(text("x"))] }));

  it("rejects documents nested deeper than the limit", () => {
    let node: unknown = p(text("deep"));
    for (let i = 0; i < LIMITS.maxDepth + 2; i++) node = { type: "blockquote", content: [node] };
    expect(() => parseRichText(doc(node))).toThrow(/nested too deeply/);
  });

  it("rejects documents with too many nodes", () => {
    const many = Array.from({ length: LIMITS.maxNodes + 1 }, () => p());
    expect(() => parseRichText(doc(...many))).toThrow(/too large/);
  });

  it("rejects oversized text", () => {
    expect(() => parseRichText(doc(p(text("x".repeat(LIMITS.maxTextLength + 1)))))).toThrow();
  });

  it("is not fooled by prototype pollution payloads", () => {
    const payload = JSON.parse(
      '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"x","marks":[{"type":"link","attrs":{"__proto__":{"href":"https://ok.example"}}}]}]}]}',
    );
    expect(() => parseRichText(payload)).toThrow(RichTextError);
    expect(({} as Record<string, unknown>)["href"]).toBeUndefined();
  });

  it("turns failures into validation issues through the zod schema", () => {
    const result = richTextSchema.safeParse(doc({ type: "script" }));
    expect(result.success).toBe(false);
    expect(richTextSchema.safeParse(doc(p(text("fine")))).success).toBe(true);
  });
});

describe("safeHref / safeImageSrc", () => {
  it.each([
    "https://a.example/x",
    "http://a.example",
    "mailto:a@b.co",
    "tel:+911234567890",
    "/blog/x",
    "#top",
  ])("allows %s", (value) => expect(safeHref(value)).toBe(value));
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:1",
    "vbscript:x",
    "data:text/html,x",
    "//x.example",
    "/\\x.example",
    "ftp://x",
    "",
    "a b",
    "https://a.example/\nx",
    5,
    null,
  ])("refuses %j", (value) => expect(safeHref(value)).toBeNull());
  it("only embeds https images from the Shopify CDN", () => {
    expect(safeImageSrc(IMG)).toBe(IMG);
    expect(safeImageSrc("https://cdn.shopify.com.evil.example/a.png")).toBeNull();
    expect(safeImageSrc("https://evil.example/cdn.shopify.com/a.png")).toBeNull();
    expect(safeImageSrc("javascript:alert(1)")).toBeNull();
  });
});

describe("renderRichText", () => {
  const render = (...content: unknown[]) => renderRichText(parseRichText(doc(...content)));

  it("escapes markup in text, so script tags can never run", () => {
    const { html } = render(p(text('<script>alert("x")</script> & <img src=x onerror=1>')));
    expect(html).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;img src=x onerror=1&gt;</p>",
    );
    expect(html).not.toMatch(/<script|<img/);
  });

  it("escapes quotes in link addresses and alt text (no attribute breakout)", () => {
    const { html } = render(
      p(text("go", [{ type: "link", attrs: { href: 'https://a.example/"onmouseover="x' } }])),
      { type: "image", attrs: { src: IMG, alt: '"><script>1</script>' } },
    );
    expect(html).not.toMatch(/"onmouseover=|<script/);
    expect(html).toContain("&quot;");
  });

  it("opens external links safely and keeps internal ones in the tab", () => {
    const { html } = render(
      p(
        text("out", [{ type: "link", attrs: { href: "https://a.example" } }]),
        text("in", [{ type: "link", attrs: { href: "/blog/care" } }]),
      ),
    );
    expect(html).toContain(
      '<a href="https://a.example" target="_blank" rel="noopener noreferrer">out</a>',
    );
    expect(html).toContain('<a href="/blog/care">in</a>');
  });

  it("nests marks and renders lists, quotes, code and rules", () => {
    const { html } = render(
      p(text("x", [{ type: "bold" }, { type: "italic" }, { type: "code" }])),
      { type: "bulletList", content: [{ type: "listItem", content: [p(text("a"))] }] },
      { type: "blockquote", content: [p(text("q"))] },
      { type: "codeBlock", content: [text("<b>")] },
      { type: "horizontalRule" },
    );
    expect(html).toBe(
      "<p><code><em><strong>x</strong></em></code></p><ul><li><p>a</p></li></ul><blockquote><p>q</p></blockquote><pre><code>&lt;b&gt;</code></pre><hr>",
    );
  });

  it("gives headings unique, stable ids and reports them for the table of contents", () => {
    const { html, headings } = render(
      { type: "heading", attrs: { level: 2 }, content: [text("Watering")] },
      { type: "heading", attrs: { level: 3 }, content: [text("How often?")] },
      { type: "heading", attrs: { level: 2 }, content: [text("Watering")] },
      { type: "heading", attrs: { level: 2 }, content: [text("!!!")] },
    );
    expect(headings.map((h) => h.id)).toEqual(["watering", "how-often", "watering-2", "section"]);
    expect(headings[1]).toEqual({ id: "how-often", text: "How often?", level: 3 });
    expect(html).toContain('<h2 id="watering">Watering</h2>');
  });

  it("serves images through the app's own optimiser with responsive sizes and no layout shift", () => {
    const { html } = render({
      type: "image",
      attrs: { src: IMG, alt: "Fern", width: 800, height: 600 },
    });
    expect(html).toContain(`src="/_next/image?url=${encodeURIComponent(IMG)}&amp;w=1080&amp;q=75"`);
    expect(html).toContain("640w");
    expect(html).toContain("1920w");
    expect(html).toContain('width="800" height="600"');
    expect(html).toContain('loading="lazy"');
    expect(html).not.toContain("https://cdn.shopify.com/s/files");
    expect(html).toContain("<figcaption>Fern</figcaption>");
  });
});

describe("text helpers", () => {
  const d = parseRichText(
    doc(
      { type: "heading", attrs: { level: 2 }, content: [text("Title")] },
      p(text("Hello "), text("world", [{ type: "bold" }])),
      { type: "bulletList", content: [{ type: "listItem", content: [p(text("item"))] }] },
    ),
  );
  it("extracts plain text across blocks", () =>
    expect(documentText(d)).toBe("Title Hello world item"));
  it("estimates reading time, never below one minute", () => {
    expect(readingMinutes("a b c")).toBe(1);
    expect(readingMinutes(Array.from({ length: 450 }, () => "w").join(" "))).toBe(3);
  });
  it("cuts excerpts at a word boundary", () => {
    expect(autoExcerpt("short")).toBe("short");
    const out = autoExcerpt("word ".repeat(60), 30);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(31);
    expect(out).not.toMatch(/wor…$/);
  });
});

describe("slugify", () => {
  it.each([
    ["Café au Lait!", "cafe-au-lait"],
    ["Plants & Pots", "plants-and-pots"],
    ["  --Hello   World--  ", "hello-world"],
    ["日本語", ""],
  ])("%s → %s", (input, slug) => expect(slugify(input)).toBe(slug));
  it("caps length without leaving a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(79)} b`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
  });
});
