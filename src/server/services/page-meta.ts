import "server-only";

import type { Metadata } from "next";

import { getPageContent } from "@/server/services/page-content-public";

/** Title, description and canonical of an editable page, from its "Search engines" section. */
export async function pageMetadata(pageId: string, canonical: string): Promise<Metadata> {
  const c = await getPageContent(pageId);
  return {
    title: c.text("seo", "metaTitle"),
    description: c.text("seo", "metaDescription"),
    alternates: { canonical },
  };
}
