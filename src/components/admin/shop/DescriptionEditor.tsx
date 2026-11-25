"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { Toolbar } from "@/components/admin/blog/RichTextEditor";
import { proseClass } from "@/components/content/prose";

/**
 * Product descriptions are HTML in Shopify. This edits that HTML with a small formatting toolbar (no images: product
 * pictures belong in the product's own image list). The server cleans the HTML again with a strict allow-list before
 * it is saved to Shopify or shown here, so nothing pasted in can add scripts, styles or embeds.
 */
export default function DescriptionEditor({
  initial,
  onChange,
}: {
  initial: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    content: initial,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        code: false,
        strike: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: false,
          protocols: ["http", "https", "mailto", "tel"],
        },
      }),
      Placeholder.configure({ placeholder: "Describe the product…" }),
    ],
    editorProps: {
      attributes: {
        "aria-label": "Product description",
        "aria-multiline": "true",
        role: "textbox",
        class: `${proseClass} min-h-[12rem] px-4 py-4 outline-none [&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]`,
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });
  if (!editor) {
    return (
      <div
        role="status"
        className="min-h-[12rem] rounded-lg border border-input p-4 text-sm text-muted-foreground"
      >
        Loading editor…
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
