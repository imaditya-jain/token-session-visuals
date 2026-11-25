import { proseClass } from "@/components/content/prose";
import type { EditorDoc } from "@/lib/page-content-core";
import { parseRichText } from "@/lib/rich-text/parse";
import { renderRichText } from "@/lib/rich-text/render";

/**
 * A page's editable body. The document was validated against the editor's allow-list when it was saved, and
 * `parseRichText` + `renderRichText` escape every string, so the HTML it returns is safe to inject.
 */
export default function RichBody({ doc, className = "" }: { doc: EditorDoc; className?: string }) {
  return (
    <div
      className={`${proseClass} [&_li_p]:mb-0 ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: renderRichText(parseRichText(doc)).html }}
    />
  );
}
