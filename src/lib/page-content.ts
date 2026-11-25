import { makeReader, type PageDef, type PageValues, type Reader } from "@/lib/page-content-core";
import { CONTENT_PAGES } from "@/lib/page-defs/content-pages";
import { HOME } from "@/lib/page-defs/home";

export * from "@/lib/page-content-core";

export const PAGES: readonly PageDef[] = [HOME, ...CONTENT_PAGES];

export const pageDef = (id: string): PageDef | undefined => PAGES.find((p) => p.id === id);

export const isPageId = (id: string): boolean => pageDef(id) !== undefined;

export function reader(pageId: string, values: PageValues): Reader {
  const page = pageDef(pageId);
  if (!page) throw new Error(`Unknown page ${pageId}`);
  return makeReader(page, values);
}
