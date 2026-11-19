import "server-only";

import sanitizeHtml from "sanitize-html";

/**
 * Policy bodies are HTML written in Shopify admin. Shopify sanitizes them, but they are rendered into
 * our pages, so they are cleaned again with a strict allow-list: text structure only, safe links, no
 * scripts, styles, forms, iframes or images.
 */
export function sanitizePolicyHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "h2",
      "h3",
      "h4",
      "p",
      "br",
      "hr",
      "ul",
      "ol",
      "li",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "blockquote",
      "a",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    allowedAttributes: { a: ["href", "title", "target", "rel"] },
    allowedSchemes: ["https", "http", "mailto", "tel"],
    allowProtocolRelative: false,
    // Merchants often use H1 for section titles; the page already has its own H1.
    transformTags: {
      h1: "h2",
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          rel: "noopener noreferrer",
          ...(attribs["target"] ? { target: "_blank" } : {}),
        },
      }),
    },
  });
}
