// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DESIGNS } from "@/lib/email-designs";
import { campaignInputSchema, type CampaignInput } from "@/lib/campaigns";
import { disconnectDb } from "@/server/db/connection";
import { Campaign } from "@/server/db/models/campaign";
import { EmailJob } from "@/server/db/models/email-job";
import { Subscriber } from "@/server/db/models/subscriber";
import { renderEmail } from "@/server/email/mailer";
import { startTestDatabase } from "@/test/mongo";

import * as service from "./campaigns";

let server: MongoMemoryServer;
const actor = new Types.ObjectId().toHexString();

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
  await Promise.all([Campaign.deleteMany({}), EmailJob.deleteMany({}), Subscriber.deleteMany({})]);
});

const input = (over: Partial<CampaignInput> = {}): CampaignInput =>
  campaignInputSchema.parse({
    name: "November note",
    subject: "New arrivals",
    design: "card.classic",
    content: {
      eyebrow: "Just in",
      heading: "Fresh from the greenhouse",
      paragraphs: ["First paragraph.", "Second paragraph."],
      cta: { label: "Shop now", url: "https://fernwood.test/shop" },
      signoff: "Thank you",
    },
    ...over,
  });

const subscribe = (...emails: string[]) =>
  Subscriber.insertMany(
    emails.map((email) => ({
      email,
      status: "subscribed",
      source: "footer",
      consentAt: new Date(),
    })),
  );

describe("designs", () => {
  it("offers 108 distinct designs", () => {
    expect(DESIGNS).toHaveLength(108);
    expect(new Set(DESIGNS.map((d) => d.id)).size).toBe(108);
  });

  it("every design renders the heading, text, button and an unsubscribe link", async () => {
    const data = {
      subject: "Hello",
      heading: "Fresh from the greenhouse",
      paragraphs: ["First paragraph."],
      cta: { label: "Shop now", url: "https://fernwood.test/shop" },
      signoff: "Thank you",
      eyebrow: "Just in",
      unsubscribeUrl: "https://fernwood.test/unsubscribe?token=t",
      oneClickUrl: "https://fernwood.test/api/newsletter/unsubscribe?token=t",
    };
    const htmls = new Set<string>();
    for (const design of DESIGNS) {
      const { html } = await renderEmail("campaign", { ...data, design: design.id });
      expect(html, design.id).toContain("Fresh from the greenhouse");
      expect(html, design.id).toContain("https://fernwood.test/shop");
      expect(html, design.id).toContain("https://fernwood.test/unsubscribe?token=t");
      htmls.add(html);
    }
    expect(htmls.size).toBe(108);
  }, 120_000);

  it("escapes anything typed into a campaign", async () => {
    const { html } = await renderEmail("campaign", {
      subject: "x",
      heading: "<script>alert(1)</script>",
      paragraphs: ["<img src=x onerror=alert(1)>"],
      unsubscribeUrl: "https://fernwood.test/u",
      oneClickUrl: "https://fernwood.test/o",
    });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
  });

  it("refuses a link that isn't https and a picture from another host", () => {
    expect(() =>
      input({ content: { ...input().content, cta: { label: "x", url: "http://x.test" } } }),
    ).toThrow();
    expect(() =>
      input({
        content: { ...input().content, image: { src: "https://evil.test/a.jpg", alt: "" } },
      }),
    ).toThrow();
  });
});

describe("campaign lifecycle", () => {
  it("sends to every confirmed subscriber once, with its design", async () => {
    await subscribe("a@example.com", "b@example.com");
    await Subscriber.create({
      email: "p@example.com",
      status: "pending",
      source: "footer",
      consentAt: new Date(),
    });
    const draft = await service.createCampaign(actor, input({ design: "hero.evergreen" }));
    const sent = await service.sendCampaign(actor, draft.id);
    expect(sent.status).toBe("sent");
    expect(sent.stats).toMatchObject({ queued: 2, skipped: 0 });
    const jobs = await EmailJob.find({ template: "campaign" }).lean();
    expect(jobs.map((j) => j.to).sort()).toEqual(["a@example.com", "b@example.com"]);
    expect((jobs[0]?.data as { design?: string }).design).toBe("hero.evergreen");
    expect((jobs[0]?.data as { subject?: string }).subject).toBe("New arrivals");
  });

  it("can't be sent twice or edited after sending", async () => {
    await subscribe("a@example.com");
    const draft = await service.createCampaign(actor, input());
    await service.sendCampaign(actor, draft.id);
    await expect(service.sendCampaign(actor, draft.id)).rejects.toMatchObject({ status: 409 });
    await expect(
      service.updateCampaign(actor, draft.id, input({ name: "Changed" })),
    ).rejects.toMatchObject({ status: 409 });
    await expect(service.deleteCampaign(draft.id)).rejects.toMatchObject({ status: 409 });
    expect(await EmailJob.countDocuments({ template: "campaign" })).toBe(1);
  });

  it("refuses to send with nobody to send to", async () => {
    const draft = await service.createCampaign(actor, input());
    await expect(service.sendCampaign(actor, draft.id)).rejects.toMatchObject({
      status: 400,
      code: "no_audience",
    });
    expect((await service.getCampaign(draft.id)).status).toBe("draft");
  });

  it("two simultaneous sends queue each recipient once", async () => {
    await subscribe("a@example.com", "b@example.com", "c@example.com");
    const draft = await service.createCampaign(actor, input());
    const results = await Promise.allSettled([
      service.sendCampaign(actor, draft.id),
      service.sendCampaign(actor, draft.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await EmailJob.countDocuments({ template: "campaign" })).toBe(3);
  });

  it("schedules, unschedules, and the sweeper sends what is due", async () => {
    await subscribe("a@example.com");
    const draft = await service.createCampaign(actor, input());
    await expect(
      service.scheduleCampaign(actor, draft.id, new Date(Date.now() + 30_000)),
    ).rejects.toMatchObject({ code: "schedule_too_soon" });

    const at = new Date(Date.now() + 60 * 60_000);
    expect((await service.scheduleCampaign(actor, draft.id, at)).status).toBe("scheduled");
    expect((await service.unscheduleCampaign(actor, draft.id)).status).toBe("draft");
    await service.scheduleCampaign(actor, draft.id, at);

    expect(await service.sendDueCampaigns()).toBe(0);
    await Campaign.updateOne(
      { _id: draft.id },
      { $set: { scheduledAt: new Date(Date.now() - 1000) } },
    );
    expect(await service.sendDueCampaigns()).toBe(1);
    expect((await service.getCampaign(draft.id)).status).toBe("sent");
    expect(await service.sendDueCampaigns()).toBe(0);
  });

  it("resumes a send that was interrupted without duplicating emails", async () => {
    await subscribe("a@example.com", "b@example.com");
    const draft = await service.createCampaign(actor, input());
    await EmailJob.create({
      template: "campaign",
      to: "a@example.com",
      dedupeKey: `campaign:${draft.id}:a@example.com`,
      data: {},
    });
    await Campaign.updateOne(
      { _id: draft.id },
      { $set: { status: "sending", sendStartedAt: new Date(Date.now() - 20 * 60_000) } },
    );
    expect(await service.sendDueCampaigns()).toBe(1);
    const sent = await service.getCampaign(draft.id);
    expect(sent.status).toBe("sent");
    expect(await EmailJob.countDocuments({ template: "campaign" })).toBe(2);
    expect(sent.stats).toMatchObject({ queued: 1, skipped: 1 });
  });

  it("a test goes to one address with a [Test] subject and never counts as the send", async () => {
    await subscribe("a@example.com");
    const draft = await service.createCampaign(actor, input());
    await service.sendTest(draft.id, "boss@example.com");
    const jobs = await EmailJob.find({ template: "campaign" }).lean();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.to).toBe("boss@example.com");
    expect((jobs[0]?.data as { subject: string }).subject).toBe("[Test] New arrivals");
    expect((await service.getCampaign(draft.id)).status).toBe("draft");
  });

  it("previews the email as HTML without storing anything", async () => {
    const html = await service.previewCampaign({ design: "banner.kiln", content: input().content });
    expect(html).toContain("Fresh from the greenhouse");
    expect(await Campaign.countDocuments({})).toBe(0);
    expect(await EmailJob.countDocuments({})).toBe(0);
  });
});
