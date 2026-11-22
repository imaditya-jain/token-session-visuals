import { slugify } from "@/lib/slug";

import type { Block, Heading, Inline, ListItem, Mark, RichDoc, TextNode } from "./types";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

/** Widths the Next image optimiser serves (its default device sizes). */
const IMAGE_WIDTHS = [640, 1080, 1920] as const;

/**
 * Images are served through the app's own optimiser (`/_next/image`), never straight from the CDN: the
 * Content-Security-Policy only allows same-origin images, and this also gives responsive sizes and modern formats.
 */
export const optimizedImageUrl = (src: string, width: number): string =>
  `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;

const isExternal = (href: string): boolean => /^https?:/i.test(href);

function renderText(node: TextNode): string {
  let html = escapeHtml(node.text);
  for (const mark of node.marks ?? []) html = wrapMark(html, mark);
  return html;
}

function wrapMark(html: string, mark: Mark): string {
  switch (mark.type) {
    case "bold":
      return `<strong>${html}</strong>`;
    case "italic":
      return `<em>${html}</em>`;
    case "strike":
      return `<s>${html}</s>`;
    case "underline":
      return `<u>${html}</u>`;
    case "code":
      return `<code>${html}</code>`;
    case "link": {
      const external = isExternal(mark.href);
      return `<a href="${escapeHtml(mark.href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${html}</a>`;
    }
  }
}

const renderInlines = (nodes: Inline[] | undefined): string =>
  (nodes ?? []).map((node) => (node.type === "hardBreak" ? "<br>" : renderText(node))).join("");

const plain = (nodes: Inline[] | undefined): string =>
  (nodes ?? []).map((node) => (node.type === "text" ? node.text : " ")).join("");

function renderImage(block: Extract<Block, { type: "image" }>): string {
  const srcset = IMAGE_WIDTHS.map((w) => `${optimizedImageUrl(block.src, w)} ${w}w`).join(", ");
  const size =
    block.width && block.height ? ` width="${block.width}" height="${block.height}"` : "";
  return `<img src="${escapeHtml(optimizedImageUrl(block.src, 1080))}" srcset="${escapeHtml(srcset)}" sizes="(min-width: 1024px) 768px, 100vw" alt="${escapeHtml(block.alt)}"${size} loading="lazy" decoding="async">`;
}

export type Rendered = { html: string; headings: Heading[] };

/**
 * Serialises a validated document to HTML. Every string is escaped and every URL was vetted at parse time, so
 * the output is safe to inject. Headings get stable ids (used by the table of contents and anchor links).
 */
export function renderRichText(doc: RichDoc): Rendered {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();

  const idFor = (text: string): string => {
    const base = slugify(text) || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };

  const item = (entry: ListItem): string => `<li>${entry.content.map(block).join("")}</li>`;

  function block(node: Block): string {
    switch (node.type) {
      case "paragraph":
        return `<p>${renderInlines(node.content)}</p>`;
      case "heading": {
        const text = plain(node.content).trim();
        const id = idFor(text);
        headings.push({ id, text, level: node.level });
        return `<h${node.level} id="${id}">${renderInlines(node.content)}</h${node.level}>`;
      }
      case "blockquote":
        return `<blockquote>${node.content.map(block).join("")}</blockquote>`;
      case "bulletList":
        return `<ul>${node.content.map(item).join("")}</ul>`;
      case "orderedList":
        return `<ol>${node.content.map(item).join("")}</ol>`;
      case "codeBlock":
        return `<pre><code>${(node.content ?? []).map((text) => escapeHtml(text.text)).join("")}</code></pre>`;
      case "horizontalRule":
        return "<hr>";
      case "image":
        return `<figure>${renderImage(node)}${node.alt ? `<figcaption>${escapeHtml(node.alt)}</figcaption>` : ""}</figure>`;
    }
  }

  return { html: doc.content.map(block).join(""), headings };
}

/** Plain text of the whole document: excerpts, search and reading time are derived from it. */
export function documentText(doc: RichDoc): string {
  const parts: string[] = [];
  const walk = (node: Block | ListItem): void => {
    switch (node.type) {
      case "paragraph":
      case "heading":
        parts.push(plain(node.content));
        break;
      case "codeBlock":
        parts.push((node.content ?? []).map((text) => text.text).join(""));
        break;
      case "blockquote":
      case "listItem":
        node.content.forEach(walk);
        break;
      case "bulletList":
      case "orderedList":
        node.content.forEach(walk);
        break;
      case "horizontalRule":
      case "image":
        break;
    }
  };
  doc.content.forEach(walk);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Whole minutes at an average adult reading speed (never below 1). */
export const readingMinutes = (text: string): number =>
  Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 220));

/** A short summary cut at a word boundary. */
export function autoExcerpt(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trimEnd()}…`;
}
