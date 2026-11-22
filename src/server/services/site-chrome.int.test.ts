// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CHROME, type SiteChrome } from "@/lib/site-chrome";
import { disconnectDb } from "@/server/db/connection";
import { SiteSetting } from "@/server/db/models/site-setting";
import { startTestDatabase } from "@/test/mongo";

import {
  discardChromeDraft,
  getAdminChrome,
  publishChrome,
  readPublishedChrome,
  saveChromeDraft,
} from "./site-chrome";

let server: MongoMemoryServer;
const actor = new Types.ObjectId().toString();

beforeAll(async () => {
  server = await startTestDatabase();
}, 120_000);
afterAll(async () => {
  await disconnectDb();
  await server.stop();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  const { connectDb } = await import("@/server/db/connection");
  await connectDb();
  await SiteSetting.deleteMany({});
});

const edited = (mutate: (c: SiteChrome) => void): SiteChrome => {
  const copy = structuredClone(DEFAULT_CHROME);
  mutate(copy);
  return copy;
};

describe("site chrome content", () => {
  it("shows the built-in defaults until something is published", async () => {
    expect(await readPublishedChrome()).toEqual(DEFAULT_CHROME);
    const admin = await getAdminChrome();
    expect(admin.draft).toEqual(DEFAULT_CHROME);
    expect(admin.hasUnpublished).toBe(false);
    expect(admin.publishedAt).toBeNull();
  });

  it("keeps drafts private: the storefront reads only what was published", async () => {
    const draft = edited((c) => {
      c.announcement.enabled = false;
    });
    const saved = await saveChromeDraft(actor, draft);
    expect(saved.hasUnpublished).toBe(true);
    expect(saved.draft.announcement.enabled).toBe(false);
    expect((await readPublishedChrome()).announcement.enabled).toBe(true);
  });

  it("publishes the draft, hides social icons with no real address and says which", async () => {
    await saveChromeDraft(
      actor,
      edited((c) => {
        c.header.nav.push({ label: "Sale", href: "/collections/sale", children: [] });
        c.social[0] = {
          id: "instagram",
          platform: "instagram",
          url: "https://instagram.com/fernwood",
          enabled: true,
        };
      }),
    );
    const { chrome, hidden } = await publishChrome(actor);
    expect(hidden).toEqual(["facebook", "twitter", "youtube"]);
    const live = await readPublishedChrome();
    expect(live.header.nav.at(-1)?.label).toBe("Sale");
    expect(live.social.filter((s) => s.enabled).map((s) => s.platform)).toEqual(["instagram"]);
    expect(chrome.hasUnpublished).toBe(false);
    expect(chrome.publishedAt).not.toBeNull();
    // The draft now shows the same, so the editor sees the icons that were hidden.
    expect(chrome.draft.social.find((s) => s.platform === "facebook")?.enabled).toBe(false);
  });

  it("discards unpublished edits", async () => {
    await publishChrome(actor);
    await saveChromeDraft(
      actor,
      edited((c) => {
        c.footer.about = "Changed";
      }),
    );
    expect((await getAdminChrome()).hasUnpublished).toBe(true);
    const after = await discardChromeDraft(actor);
    expect(after.hasUnpublished).toBe(false);
    expect(after.draft.footer.about).toBe(DEFAULT_CHROME.footer.about);
  });

  it("falls back to the defaults if stored published content is corrupt, instead of breaking the site", async () => {
    await SiteSetting.create({
      key: "chrome",
      draft: DEFAULT_CHROME,
      published: { header: "garbage" },
    });
    expect(await readPublishedChrome()).toEqual(DEFAULT_CHROME);
    await SiteSetting.updateOne({ key: "chrome" }, { $set: { published: null } });
    expect(await readPublishedChrome()).toEqual(DEFAULT_CHROME);
  });

  it("treats a corrupt draft as the published content", async () => {
    await SiteSetting.create({ key: "chrome", draft: 42 });
    const admin = await getAdminChrome();
    expect(admin.draft).toEqual(DEFAULT_CHROME);
  });

  it("stores one document however many times it is saved", async () => {
    await saveChromeDraft(actor, DEFAULT_CHROME);
    await saveChromeDraft(actor, DEFAULT_CHROME);
    await publishChrome(actor);
    expect(await SiteSetting.countDocuments({ key: "chrome" })).toBe(1);
  });
});
