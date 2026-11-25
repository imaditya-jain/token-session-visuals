import type { EditorDoc } from "@/lib/page-content-core";

/**
 * A tiny writing aid for the default content of pages: `**bold**` and `[label](href)` inside a string become the
 * editor's own JSON, so the defaults and anything an editor saves have exactly the same shape.
 */
type Node = Record<string, unknown>;

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

export function inline(source: string): Node[] {
  return source
    .split(TOKEN)
    .filter((part) => part !== "")
    .map((part): Node => {
      const bold = /^\*\*([^*]+)\*\*$/.exec(part);
      if (bold?.[1]) return { type: "text", text: bold[1], marks: [{ type: "bold" }] };
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link?.[1] && link[2])
        return { type: "text", text: link[1], marks: [{ type: "link", attrs: { href: link[2] } }] };
      return { type: "text", text: part };
    });
}

export const p = (source: string): Node => ({ type: "paragraph", content: inline(source) });
export const h2 = (source: string): Node => ({
  type: "heading",
  attrs: { level: 2 },
  content: inline(source),
});
const items = (list: string[]): Node[] =>
  list.map((entry) => ({ type: "listItem", content: [p(entry)] }));
export const ul = (list: string[]): Node => ({ type: "bulletList", content: items(list) });
export const ol = (list: string[]): Node => ({ type: "orderedList", content: items(list) });
export const doc = (...blocks: Node[]): EditorDoc => ({ type: "doc", content: blocks });
