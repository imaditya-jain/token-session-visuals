"use client";

import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState, type ReactNode } from "react";

import MediaPicker from "@/components/admin/blog/MediaPicker";
import { proseClass } from "@/components/content/prose";
import { Button } from "@/components/ui/button";
import type { MediaView } from "@/lib/blog-types";
import { optimizedImageUrl, safeHref, type RichDoc } from "@/lib/rich-text";

/** `/_next/image?url=<original>&…` back to the original address (so copy and paste inside the editor round-trips). */
function originalSrc(src: string | null): string | null {
  if (!src?.startsWith("/_next/image?")) return src;
  return new URLSearchParams(src.slice("/_next/image?".length)).get("url");
}

/**
 * The page's Content-Security-Policy only allows same-origin images, so inside the editor pictures are shown
 * through the app's image optimiser. The document itself keeps the original CDN address.
 */
const EditorImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element: HTMLElement) => originalSrc(element.getAttribute("src")),
        renderHTML: (attributes: { src?: string | null }) => ({
          src: attributes.src ? optimizedImageUrl(attributes.src, 1080) : null,
        }),
      },
    };
  },
});

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-11 min-w-11 items-center justify-center rounded-md px-2 text-sm font-semibold transition-colors disabled:opacity-40 ${
        active ? "bg-forest text-cream" : "text-forest hover:bg-muted"
      }`}
    >
      {/* The symbol is decoration; the button's name is the plain-language label. */}
      <span aria-hidden>{children}</span>
      <span className="sr-only">{label}</span>
    </button>
  );
}

/** The formatting toolbar. The image button appears only where an image picker is provided. */
export function Toolbar({
  editor,
  onImage,
}: {
  editor: Editor;
  onImage?: (() => void) | undefined;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      h4: e.isActive("heading", { level: 4 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const chain = () => editor.chain().focus();

  const openLink = () => {
    setHref((editor.getAttributes("link")["href"] as string | undefined) ?? "");
    setLinkError(null);
    setLinkOpen(true);
  };
  const applyLink = () => {
    const safe = safeHref(href);
    if (!safe)
      return setLinkError(
        "Use a web address (https://…), an email (mailto:…) or a path like /shop.",
      );
    chain().extendMarkRange("link").setLink({ href: safe }).run();
    setLinkOpen(false);
  };

  return (
    <div className="border-b border-border">
      <div role="toolbar" aria-label="Text formatting" className="flex flex-wrap gap-0.5 p-1.5">
        <ToolbarButton label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()}>
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={state.italic}
          onClick={() => chain().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={state.underline}
          onClick={() => chain().toggleUnderline().run()}
        >
          <span className="underline">U</span>
        </ToolbarButton>
        <ToolbarButton
          label="Strikethrough"
          active={state.strike}
          onClick={() => chain().toggleStrike().run()}
        >
          <span className="line-through">S</span>
        </ToolbarButton>
        <ToolbarButton
          label="Inline code"
          active={state.code}
          onClick={() => chain().toggleCode().run()}
        >
          {"</>"}
        </ToolbarButton>
        <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
        <ToolbarButton
          label="Heading 2"
          active={state.h2}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          label="Heading 3"
          active={state.h3}
          onClick={() => chain().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          label="Heading 4"
          active={state.h4}
          onClick={() => chain().toggleHeading({ level: 4 }).run()}
        >
          H4
        </ToolbarButton>
        <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
        <ToolbarButton
          label="Bulleted list"
          active={state.bullet}
          onClick={() => chain().toggleBulletList().run()}
        >
          • List
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={state.ordered}
          onClick={() => chain().toggleOrderedList().run()}
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={state.quote}
          onClick={() => chain().toggleBlockquote().run()}
        >
          “ ”
        </ToolbarButton>
        <ToolbarButton
          label="Code block"
          active={state.codeBlock}
          onClick={() => chain().toggleCodeBlock().run()}
        >
          {"{ }"}
        </ToolbarButton>
        <ToolbarButton label="Horizontal rule" onClick={() => chain().setHorizontalRule().run()}>
          ―
        </ToolbarButton>
        <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
        <ToolbarButton label="Link" active={state.link} onClick={openLink}>
          Link
        </ToolbarButton>
        {onImage ? (
          <ToolbarButton label="Insert image" onClick={onImage}>
            Image
          </ToolbarButton>
        ) : null}
        <span className="mx-1 w-px self-stretch bg-border" aria-hidden />
        <ToolbarButton label="Undo" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
          ↶
        </ToolbarButton>
        <ToolbarButton label="Redo" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
          ↷
        </ToolbarButton>
      </div>
      {linkOpen ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-border bg-muted/40 p-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="link-href" className="mb-1 block text-xs text-muted-foreground">
              Link address
            </label>
            <input
              id="link-href"
              value={href}
              onChange={(event) => setHref(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
              }}
              placeholder="https://"
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <Button type="button" className="h-11" onClick={applyLink}>
            Apply
          </Button>
          {state.link ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => {
                chain().extendMarkRange("link").unsetLink().run();
                setLinkOpen(false);
              }}
            >
              Remove link
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setLinkOpen(false)}
          >
            Cancel
          </Button>
          {linkError ? (
            <p role="alert" className="w-full text-sm text-destructive">
              {linkError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The post editor. It edits the blog's document format and emits it as JSON on every change; the server validates
 * it again and renders the HTML itself, so nothing the editor produces is trusted.
 */
export default function RichTextEditor({
  initial,
  onChange,
}: {
  initial: RichDoc;
  onChange: (doc: RichDoc) => void;
}) {
  const [picking, setPicking] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    content: initial,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: {
          openOnClick: false,
          autolink: false,
          protocols: ["http", "https", "mailto", "tel"],
        },
      }),
      EditorImage.configure({ allowBase64: false, inline: false }),
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    editorProps: {
      attributes: {
        "aria-label": "Post content",
        "aria-multiline": "true",
        role: "textbox",
        class: `${proseClass} min-h-[24rem] px-4 py-4 outline-none [&_figure]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_img.ProseMirror-selectednode]:ring-2 [&_img.ProseMirror-selectednode]:ring-ring [&_pre]:rounded-lg [&_pre]:bg-forest-deep [&_pre]:p-4 [&_pre]:text-cream [&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]`,
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as RichDoc),
  });

  const insertImage = (media: MediaView) => {
    editor
      ?.chain()
      .focus()
      .setImage({
        src: media.url,
        alt: media.alt,
        ...(media.width && media.height ? { width: media.width, height: media.height } : {}),
      })
      .run();
  };

  if (!editor) {
    return (
      <div
        role="status"
        className="min-h-[24rem] rounded-lg border border-input p-4 text-sm text-muted-foreground"
      >
        Loading editor…
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
      <Toolbar editor={editor} onImage={() => setPicking(true)} />
      <EditorContent editor={editor} />
      <MediaPicker open={picking} onOpenChange={setPicking} onPick={insertImage} />
    </div>
  );
}
