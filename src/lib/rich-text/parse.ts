import { z } from "zod";

import type { Block, Inline, ListItem, Mark, RichDoc, TextNode } from "./types";

export const LIMITS = {
  maxDepth: 8,
  maxNodes: 4000,
  maxTextLength: 50_000,
  maxHrefLength: 2048,
} as const;

const MARKS = new Set(["bold", "italic", "strike", "underline", "code"]);

/** Hosts whose images may be embedded (the Shopify CDN that serves the media library). */
export const ALLOWED_IMAGE_HOSTS: readonly string[] = ["cdn.shopify.com"];

export class RichTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RichTextError";
  }
}

/** Control characters and whitespace have no place in a URL (they are used to smuggle `java\nscript:` past filters). */
const hasControlOrSpace = (value: string): boolean =>
  /\s/.test(value) ||
  [...value].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f);

/** Links may point to the web, a mailbox or a phone, or stay on this site. No `javascript:`, `data:` or `//host`. */
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const href = value.trim();
  if (!href || href.length > LIMITS.maxHrefLength || hasControlOrSpace(href)) return null;
  if (href.startsWith("/")) return href.startsWith("//") || href.startsWith("/\\") ? null : href;
  if (href.startsWith("#")) return href;
  try {
    const url = new URL(href);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

export function safeImageSrc(value: unknown): string | null {
  if (typeof value !== "string" || value.length > LIMITS.maxHrefLength) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_IMAGE_HOSTS.includes(url.hostname) && !url.username
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

type Budget = { nodes: number };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function spend(budget: Budget): void {
  if (++budget.nodes > LIMITS.maxNodes) throw new RichTextError("The document is too large.");
}

function parseMarks(raw: unknown, budget: Budget): Mark[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new RichTextError("Invalid text formatting.");
  const marks: Mark[] = [];
  for (const entry of raw) {
    spend(budget);
    if (!isObject(entry) || typeof entry["type"] !== "string")
      throw new RichTextError("Invalid text formatting.");
    const type = entry["type"];
    if (type === "link") {
      const attrs = entry["attrs"];
      const href = safeHref(isObject(attrs) ? attrs["href"] : undefined);
      if (!href) throw new RichTextError("A link has an address that isn't allowed.");
      marks.push({ type: "link", href });
    } else if (MARKS.has(type)) {
      marks.push({ type } as Mark);
    } else {
      throw new RichTextError(`Formatting "${type}" isn't supported.`);
    }
  }
  return marks.length ? marks : undefined;
}

function parseText(node: Record<string, unknown>, budget: Budget): TextNode {
  const text = node["text"];
  if (typeof text !== "string" || text.length === 0 || text.length > LIMITS.maxTextLength)
    throw new RichTextError("Invalid text.");
  const marks = parseMarks(node["marks"], budget);
  return { type: "text", text, ...(marks ? { marks } : {}) };
}

function parseInlines(raw: unknown, budget: Budget): Inline[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new RichTextError("Invalid content.");
  const out: Inline[] = [];
  for (const node of raw) {
    spend(budget);
    if (!isObject(node)) throw new RichTextError("Invalid content.");
    if (node["type"] === "text") out.push(parseText(node, budget));
    else if (node["type"] === "hardBreak") out.push({ type: "hardBreak" });
    else throw new RichTextError(`"${String(node["type"])}" isn't allowed here.`);
  }
  return out.length ? out : undefined;
}

function parseListItems(raw: unknown, depth: number, budget: Budget): ListItem[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new RichTextError("Invalid list.");
  return raw.map((item) => {
    spend(budget);
    if (!isObject(item) || item["type"] !== "listItem") throw new RichTextError("Invalid list.");
    return { type: "listItem", content: parseBlocks(item["content"], depth + 1, budget) };
  });
}

function parseBlocks(raw: unknown, depth: number, budget: Budget): Block[] {
  if (depth > LIMITS.maxDepth) throw new RichTextError("The document is nested too deeply.");
  if (!Array.isArray(raw)) throw new RichTextError("Invalid content.");
  return raw.map((node): Block => {
    spend(budget);
    if (!isObject(node) || typeof node["type"] !== "string")
      throw new RichTextError("Invalid content.");
    const attrs = isObject(node["attrs"]) ? node["attrs"] : {};
    switch (node["type"]) {
      case "paragraph": {
        const content = parseInlines(node["content"], budget);
        return { type: "paragraph", ...(content ? { content } : {}) };
      }
      case "heading": {
        const level = attrs["level"];
        if (level !== 2 && level !== 3 && level !== 4)
          throw new RichTextError("Headings can be level 2, 3 or 4.");
        const content = parseInlines(node["content"], budget);
        return { type: "heading", level, ...(content ? { content } : {}) };
      }
      case "blockquote":
        return { type: "blockquote", content: parseBlocks(node["content"], depth + 1, budget) };
      case "bulletList":
        return { type: "bulletList", content: parseListItems(node["content"], depth, budget) };
      case "orderedList":
        return { type: "orderedList", content: parseListItems(node["content"], depth, budget) };
      case "codeBlock": {
        const inline = parseInlines(node["content"], budget) ?? [];
        const content = inline.filter((item): item is TextNode => item.type === "text");
        return { type: "codeBlock", ...(content.length ? { content } : {}) };
      }
      case "horizontalRule":
        return { type: "horizontalRule" };
      case "image": {
        const src = safeImageSrc(attrs["src"]);
        if (!src) throw new RichTextError("An image comes from a source that isn't allowed.");
        const alt = typeof attrs["alt"] === "string" ? attrs["alt"].slice(0, 300) : "";
        const dimension = (value: unknown) =>
          typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 10_000
            ? value
            : undefined;
        const width = dimension(attrs["width"]);
        const height = dimension(attrs["height"]);
        return {
          type: "image",
          src,
          alt,
          ...(width && height ? { width, height } : {}),
        };
      }
      default:
        throw new RichTextError(`"${node["type"]}" isn't supported.`);
    }
  });
}

/** Validates editor JSON against the allow-list and returns a normalised document. Throws `RichTextError`. */
export function parseRichText(input: unknown): RichDoc {
  if (!isObject(input) || input["type"] !== "doc")
    throw new RichTextError("The document is invalid.");
  const budget: Budget = { nodes: 0 };
  const content = parseBlocks(input["content"], 0, budget);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** For request bodies: invalid documents become field errors, never a crash. */
export const richTextSchema = z.unknown().transform((value, ctx): RichDoc => {
  try {
    return parseRichText(value);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      message: error instanceof RichTextError ? error.message : "The document is invalid.",
    });
    return z.NEVER;
  }
});
