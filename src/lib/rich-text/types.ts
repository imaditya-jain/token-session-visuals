/**
 * The blog's document format: a strict subset of the editor's JSON (ProseMirror/Tiptap). Anything outside it is
 * rejected on save, so what is stored and rendered is always one of these shapes.
 */
export type Mark =
  { type: "bold" | "italic" | "strike" | "underline" | "code" } | { type: "link"; href: string };

export type TextNode = { type: "text"; text: string; marks?: Mark[] };
export type HardBreak = { type: "hardBreak" };
export type Inline = TextNode | HardBreak;

export type ImageNode = {
  type: "image";
  src: string;
  alt: string;
  width?: number;
  height?: number;
};

export type ListItem = { type: "listItem"; content: Block[] };

export type Block =
  | { type: "paragraph"; content?: Inline[] }
  | { type: "heading"; level: 2 | 3 | 4; content?: Inline[] }
  | { type: "blockquote"; content: Block[] }
  | { type: "bulletList"; content: ListItem[] }
  | { type: "orderedList"; content: ListItem[] }
  | { type: "codeBlock"; content?: TextNode[] }
  | { type: "horizontalRule" }
  | ImageNode;

export type RichDoc = { type: "doc"; content: Block[] };

export type Heading = { id: string; text: string; level: 2 | 3 | 4 };

export const EMPTY_DOC: RichDoc = { type: "doc", content: [{ type: "paragraph" }] };
