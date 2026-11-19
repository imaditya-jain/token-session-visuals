import { describe, expect, it } from "vitest";

import { sanitizePolicyHtml } from "./sanitize";

describe("sanitizePolicyHtml", () => {
  it("keeps ordinary policy structure", () => {
    const html = "<h2>Returns</h2><p>Within <strong>30 days</strong>.</p><ul><li>Photo</li></ul>";
    expect(sanitizePolicyHtml(html)).toBe(html);
  });

  it.each([
    ["script tags", "<p>a</p><script>alert(1)</script>", "script"],
    ["inline handlers", '<p onclick="steal()">a</p>', "onclick"],
    ["javascript links", '<a href="javascript:alert(1)">x</a>', "javascript:"],
    ["data links", '<a href="data:text/html;base64,AAAA">x</a>', "data:"],
    ["iframes", '<iframe src="https://evil.example"></iframe>', "iframe"],
    ["images", '<img src="x" onerror="alert(1)">', "img"],
    ["styles", '<p style="position:fixed">a</p><style>p{}</style>', "style"],
    ["forms", '<form action="https://evil.example"><input name="pw"></form>', "form"],
    ["protocol-relative links", '<a href="//evil.example">x</a>', "//evil.example"],
  ])("strips %s", (_name, html, forbidden) => {
    expect(sanitizePolicyHtml(html).toLowerCase()).not.toContain(forbidden);
  });

  it("demotes h1 so the page keeps a single h1", () => {
    expect(sanitizePolicyHtml("<h1>Terms</h1>")).toBe("<h2>Terms</h2>");
  });

  it("forces safe rel on links and keeps https and mailto", () => {
    const out = sanitizePolicyHtml(
      '<a href="https://example.com" target="_blank">a</a><a href="mailto:hi@example.com">b</a>',
    );
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('href="mailto:hi@example.com"');
  });
});
