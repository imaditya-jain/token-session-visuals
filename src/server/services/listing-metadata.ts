import "server-only";

import type { Metadata } from "next";

import { getCollection } from "@/data/catalog";
import { SHOP_PATH } from "@/lib/shop";
import { getPageContent } from "@/server/services/page-content-public";

/** Every filtered or paged address is the same page, whose canonical address is the plain listing. */
export async function shopMetadata(): Promise<Metadata> {
  const c = await getPageContent("shop");
  const title = c.text("seo", "metaTitle");
  const description = c.text("seo", "metaDescription");
  return {
    title,
    description,
    alternates: { canonical: SHOP_PATH },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image" },
  };
}

export async function collectionMetadata(slug: string): Promise<Metadata> {
  const collection = await getCollection(slug);
  if (!collection) return { title: "Collection — Fernwood" };
  const title = `${collection.name} — Fernwood`;
  return {
    title,
    description: collection.description,
    alternates: { canonical: `/collections/${slug}` },
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
