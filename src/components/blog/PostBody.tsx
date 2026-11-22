import { proseClass } from "@/components/content/prose";

const bodyClass = [
  proseClass,
  "[&_figure]:my-8 [&_img]:h-auto [&_img]:w-full [&_img]:rounded-xl",
  "[&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-muted-foreground",
  "[&_pre]:my-6 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-forest-deep [&_pre]:p-4 [&_pre]:text-sm [&_pre]:text-cream",
  "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[0.9em]",
  "[&_h2]:scroll-mt-24 [&_h3]:scroll-mt-24",
].join(" ");

/**
 * The post's text. The HTML is produced by our own serializer from a validated document (every string escaped,
 * every URL vetted), never taken from a request, so injecting it is safe.
 */
export default function PostBody({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`${bodyClass} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
