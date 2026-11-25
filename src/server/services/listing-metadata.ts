import "server-only";

import type { Metadata } from "next";

import { getCollection } from "@/data/catalog";
import { SHOP_PATH } from "@/lib/shop";
import { getPageContent } from "@/server/services/page-content-public";

/** Filtered and paginated variants are for people, not for the search index. */
const robotsFor = (hasParams: boolean): Metadata["robots"] =>
  hasParams ? { index: false, follow: true } : undefined;

export async function shopMetadata(hasParams: boolean): Promise<Metadata> {
  const c = await getPageContent("shop");
  const title = c.text("seo", "metaTitle");
  const description = c.text("seo", "metaDescription");
  return {
    title,
    description,
    alternates: { canonical: SHOP_PATH },
    robots: robotsFor(hasParams),
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image" },
  };
}

export async function collectionMetadata(slug: string, hasParams: boolean): Promise<Metadata> {
  const collection = await getCollection(slug);
  if (!collection) return { title: "Collection — Fernwood" };
  const title = `${collection.name} — Fernwood`;
  return {
    title,
    description: collection.description,
    alternates: { canonical: `/collections/${slug}` },
    robots: robotsFor(hasParams),
    openGraph: {
      title,
      description: collection.description,
      type: "website",
      ...(collection.image ? { images: [{ url: collection.image, alt: collection.name }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      ...(collection.image ? { images: [collection.image] } : {}),
    },
  };
}
