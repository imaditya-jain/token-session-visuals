import "server-only";

import { Types } from "mongoose";

import {
  chromeDraftSchema,
  chromeSchema,
  DEFAULT_CHROME,
  normalizeForPublish,
  type SiteChrome,
  type SocialPlatform,
} from "@/lib/site-chrome";
import { connectDb } from "@/server/db/connection";
import { SiteSetting } from "@/server/db/models/site-setting";
import { logger } from "@/server/logger";

const KEY = "chrome";

/** The same content in the same key order compares equal (zod output order is stable). */
const same = (a: SiteChrome, b: SiteChrome): boolean => JSON.stringify(a) === JSON.stringify(b);

const parsePublished = (value: unknown): SiteChrome | null => {
  const parsed = chromeSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  logger.error(
    { issues: parsed.error.issues.slice(0, 3) },
    "Stored site chrome is invalid; using the defaults",
  );
  return null;
};

/**
 * What the storefront shows: the published content, else the built-in defaults. A stored value that no longer
 * validates falls back to the defaults rather than breaking every page. Throws only when the database is down.
 */
export async function readPublishedChrome(): Promise<SiteChrome> {
  await connectDb();
  const doc = await SiteSetting.findOne({ key: KEY }, { published: 1 }).lean();
  if (!doc || doc.published === undefined || doc.published === null) return DEFAULT_CHROME;
  return parsePublished(doc.published) ?? DEFAULT_CHROME;
}

export type AdminChrome = {
  draft: SiteChrome;
  published: SiteChrome;
  publishedAt: string | null;
  hasUnpublished: boolean;
};

export async function getAdminChrome(): Promise<AdminChrome> {
  await connectDb();
  const doc = await SiteSetting.findOne({ key: KEY }).lean();
  const published = doc?.published
    ? (parsePublished(doc.published) ?? DEFAULT_CHROME)
    : DEFAULT_CHROME;
  const parsedDraft = doc ? chromeDraftSchema.safeParse(doc.draft) : null;
  const draft = parsedDraft?.success ? parsedDraft.data : published;
  return {
    draft,
    published,
    publishedAt: doc?.publishedAt?.toISOString() ?? null,
    hasUnpublished: !same(draft, published),
  };
}

export async function saveChromeDraft(actorId: string, chrome: SiteChrome): Promise<AdminChrome> {
  await connectDb();
  await SiteSetting.updateOne(
    { key: KEY },
    { $set: { draft: chrome, updatedBy: new Types.ObjectId(actorId) }, $setOnInsert: { key: KEY } },
    { upsert: true },
  );
  return getAdminChrome();
}

/** Publishes the draft. Social icons without a real address are hidden and reported back. */
export async function publishChrome(
  actorId: string,
): Promise<{ chrome: AdminChrome; hidden: SocialPlatform[] }> {
  const current = await getAdminChrome();
  const { chrome, hidden } = normalizeForPublish(current.draft);
  const valid = chromeSchema.parse(chrome);
  const by = new Types.ObjectId(actorId);
  await SiteSetting.updateOne(
    { key: KEY },
    {
      $set: {
        draft: valid,
        published: valid,
        publishedAt: new Date(),
        publishedBy: by,
        updatedBy: by,
      },
      $setOnInsert: { key: KEY },
    },
    { upsert: true },
  );
  return { chrome: await getAdminChrome(), hidden };
}

/** Throws away unpublished edits: the draft becomes the published content again. */
export async function discardChromeDraft(actorId: string): Promise<AdminChrome> {
  const current = await getAdminChrome();
  return saveChromeDraft(actorId, current.published);
}
