import Link from "next/link";
import type { ReactNode } from "react";

import { safeHref } from "@/lib/rich-text/parse";

const TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
const linkClass = "font-medium text-forest underline underline-offset-4 hover:text-clay";

/** Short text with `**bold**` and `[label](href)`; links are vetted, anything unsafe is shown as plain text. */
export default function InlineMarkup({ text }: { text: string }) {
  const parts: ReactNode[] = text.split(TOKEN).map((part, index) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) return <strong key={index}>{bold[1]}</strong>;
    const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (!match) return part;
    const href = safeHref(match[2]);
    if (!href) return match[1];
    return /^(https?:|mailto:|tel:)/i.test(href) ? (
      <a key={index} href={href} className={linkClass}>
        {match[1]}
      </a>
    ) : (
      <Link key={index} href={href} className={linkClass}>
        {match[1]}
      </Link>
    );
  });
  return <>{parts}</>;
}

/** The same text without the markup (for structured data and search snippets). */
export const plainText = (text: string): string =>
  text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
