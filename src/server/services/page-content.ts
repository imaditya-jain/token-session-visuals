import "server-only";

import { Types } from "mongoose";

import { mergeValues, pageDef, type PageValues } from "@/lib/page-content";
import { validatePageValues } from "@/lib/page-content-validate";
import { connectDb } from "@/server/db/connection";
import { SiteSetting } from "@/server/db/models/site-setting";
import { badRequest, notFound } from "@/server/http/errors";

const keyOf = (pageId: string) => `page:${pageId}`;

const definition = (pageId: string) => {
  const page = pageDef(pageId);
  if (!page) throw notFound("That page isn't editable.", "page_not_found");
  return page;
};

const same = (a: PageValues, b: PageValues) => JSON.stringify(a) === JSON.stringify(b);

/** What visitors see: the published values over the defaults. Throws only when the database is down. */
export async function readPublishedPage(pageId: string): Promise<PageValues> {
  const page = definition(pageId);
  await connectDb();
  const doc = await SiteSetting.findOne({ key: keyOf(pageId) }, { published: 1 }).lean();
  return mergeValues(page, doc?.published);
}

export type AdminPage = {
  id: string;
  draft: PageValues;
  published: PageValues;
  publishedAt: string | null;
  hasUnpublished: boolean;
};

export async function getAdminPage(pageId: string): Promise<AdminPage> {
  const page = definition(pageId);
  await connectDb();
  const doc = await SiteSetting.findOne({ key: keyOf(pageId) }).lean();
  const published = mergeValues(page, doc?.published);
  const draft = doc?.draft ? mergeValues(page, doc.draft) : published;
  return {
    id: pageId,
    draft,
    published,
    publishedAt: doc?.publishedAt?.toISOString() ?? null,
    hasUnpublished: !same(draft, published),
  };
}

export async function listAdminPages(): Promise<
  { id: string; title: string; path: string; hasUnpublished: boolean; publishedAt: string | null }[]
> {
  const { PAGES } = await import("@/lib/page-content");
  return Promise.all(
    PAGES.map(async (p) => {
      const state = await getAdminPage(p.id);
      return {
        id: p.id,
        title: p.title,
        path: p.path,
        hasUnpublished: state.hasUnpublished,
        publishedAt: state.publishedAt,
      };
    }),
  );
}

export async function savePageDraft(
  actorId: string,
  pageId: string,
  input: unknown,
): Promise<AdminPage> {
  definition(pageId);
  const parsed = validatePageValues(pageId, input);
  if (!parsed?.success) {
    throw badRequest(
      parsed?.error.issues[0]?.message ?? "Some content is invalid.",
      "invalid_content",
    );
  }
  await connectDb();
  await SiteSetting.updateOne(
    { key: keyOf(pageId) },
    {
      $set: { draft: parsed.data, updatedBy: new Types.ObjectId(actorId) },
      $setOnInsert: { key: keyOf(pageId) },
    },
    { upsert: true },
  );
  return getAdminPage(pageId);
}

export async function publishPage(actorId: string, pageId: string): Promise<AdminPage> {
  const current = await getAdminPage(pageId);
  const parsed = validatePageValues(pageId, current.draft);
  if (!parsed?.success)
    throw badRequest(
      parsed?.error.issues[0]?.message ?? "Some content is invalid.",
      "invalid_content",
    );
  const by = new Types.ObjectId(actorId);
  await SiteSetting.updateOne(
    { key: keyOf(pageId) },
    {
      $set: {
        draft: parsed.data,
        published: parsed.data,
        publishedAt: new Date(),
        publishedBy: by,
        updatedBy: by,
      },
      $setOnInsert: { key: keyOf(pageId) },
    },
    { upsert: true },
  );
  return getAdminPage(pageId);
}

export async function discardPageDraft(actorId: string, pageId: string): Promise<AdminPage> {
  const current = await getAdminPage(pageId);
  return savePageDraft(actorId, pageId, current.published);
}
