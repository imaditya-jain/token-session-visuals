/** Typography for long-form text, built only from the locked tokens. */
export const proseClass = [
  "text-base leading-relaxed text-foreground/90",
  "[&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-medium [&_h2]:text-forest",
  "[&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-medium [&_h3]:text-forest",
  "[&_h4]:mb-2 [&_h4]:mt-6 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-wider [&_h4]:text-clay",
  "[&_p]:mb-4",
  "[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1.5",
  "[&_a]:font-medium [&_a]:text-forest [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-clay",
  "[&_blockquote]:my-6 [&_blockquote]:border-l-2 [&_blockquote]:border-sage [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-8 [&_hr]:border-border",
  "[&_table]:my-6 [&_table]:w-full [&_table]:text-sm [&_th]:border-b [&_th]:border-border [&_th]:p-2 [&_th]:text-left [&_td]:border-b [&_td]:border-border [&_td]:p-2",
].join(" ");
