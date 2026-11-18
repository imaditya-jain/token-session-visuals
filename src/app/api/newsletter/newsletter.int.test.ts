// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createUnsubscribeToken, readUnsubscribeToken } from "@/server/auth/tokens";
import { disconnectDb } from "@/server/db/connection";
import { AuthToken } from "@/server/db/models/auth-token";
import { EmailJob } from "@/server/db/models/email-job";
import { RateLimit } from "@/server/db/models/rate-limit";
import { Subscriber } from "@/server/db/models/subscriber";
import { User } from "@/server/db/models/user";
import { renderEmail } from "@/server/email/mailer";
import { confirmEmailVerification, registerUser, updateProfile } from "@/server/services/auth";
import { enqueueCampaign } from "@/server/services/newsletter";
import { startTestDatabase } from "@/test/mongo";

import { POST as confirm } from "./confirm/route";
import { POST as subscribe } from "./route";
import { POST as unsubscribe } from "./unsubscribe/route";

const ORIGIN = "http://localhost:3100";
let server: MongoMemoryServer;

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
  await Promise.all([
    User.deleteMany({}),
    Subscriber.deleteMany({}),
    EmailJob.deleteMany({}),
    AuthToken.deleteMany({}),
    RateLimit.deleteMany({}),
  ]);
});

type Init = {
  body?: unknown;
  origin?: string | null;
  ip?: string;
  query?: string;
  headers?: Record<string, string>;
};
const post = (
  path: string,
  { body, origin = ORIGIN, ip = "198.51.100.5", query = "", headers = {} }: Init = {},
) =>
  new NextRequest(`${ORIGIN}${path}${query}`, {
    method: "POST",
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(origin ? { origin } : {}),
      "x-forwarded-for": ip,
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const confirmationToken = async (email: string) => {
  const job = await EmailJob.findOne({ template: "newsletter-confirm", to: email })
    .sort({ createdAt: -1 })
    .lean();
  return new URL(String((job?.data as { url: string }).url)).searchParams.get("token")!;
};

describe("POST /api/newsletter (double opt-in)", () => {
  it("accepts a signup, stores it as pending and emails a confirmation link (nothing is subscribed yet)", async () => {
    const response = await subscribe(
      post("/api/newsletter", { body: { email: "  Fern@Example.com " } }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { accepted: true } });

    expect(await Subscriber.findOne({ email: "fern@example.com" }).lean()).toMatchObject({
      status: "pending",
      source: "footer",
    });
    expect(
      await EmailJob.countDocuments({ template: "newsletter-confirm", to: "fern@example.com" }),
    ).toBe(1);
  });

  it("looks identical for an already-subscribed address and sends nothing (no enumeration)", async () => {
    await Subscriber.create({
      email: "member@example.com",
      status: "subscribed",
      source: "footer",
      consentAt: new Date(),
    });
    const response = await subscribe(
      post("/api/newsletter", { body: { email: "member@example.com" } }),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ data: { accepted: true } });
    expect(await EmailJob.countDocuments()).toBe(0);
  });

  it("validates input, CSRF, content type and rate limits per IP and per address", async () => {
    expect((await subscribe(post("/api/newsletter", { body: { email: "nope" } }))).status).toBe(
      400,
    );
    expect(
      (
        await subscribe(
          post("/api/newsletter", { body: { email: "a@b.co" }, origin: "https://evil.example" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await subscribe(
          post("/api/newsletter", { body: {}, headers: { "content-type": "text/plain" } }),
        )
      ).status,
    ).toBe(400);

    for (let i = 0; i < 3; i++) {
      expect(
        (
          await subscribe(
            post("/api/newsletter", {
              body: { email: "flood@example.com" },
              ip: `198.51.100.${10 + i}`,
            }),
          )
        ).status,
      ).toBe(202);
    }
    const blocked = await subscribe(
      post("/api/newsletter", { body: { email: "flood@example.com" }, ip: "198.51.100.99" }),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();

    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      last = await subscribe(
        post("/api/newsletter", { body: { email: `ip${i}@example.com` }, ip: "198.51.100.200" }),
      );
    }
    expect(last?.status).toBe(429);
  });
});

describe("POST /api/newsletter/confirm", () => {
  it("subscribes on the first click and rejects replays, garbage and wrong-purpose tokens", async () => {
    await subscribe(post("/api/newsletter", { body: { email: "fern@example.com" } }));
    const token = await confirmationToken("fern@example.com");

    const ok = await confirm(post("/api/newsletter/confirm", { body: { token } }));
    expect(ok.status).toBe(200);
    expect(await Subscriber.findOne({ email: "fern@example.com" }).lean()).toMatchObject({
      status: "subscribed",
    });

    expect((await confirm(post("/api/newsletter/confirm", { body: { token } }))).status).toBe(400);
    expect(
      (await confirm(post("/api/newsletter/confirm", { body: { token: "x".repeat(40) } }))).status,
    ).toBe(400);
    expect(
      (await confirm(post("/api/newsletter/confirm", { body: { token: "short" } }))).status,
    ).toBe(400);
    expect(
      (
        await confirm(
          post("/api/newsletter/confirm", { body: { token }, origin: "https://evil.example" }),
        )
      ).status,
    ).toBe(403);
  });

  it("a stored token is only a hash, and a newer signup invalidates the older link", async () => {
    await subscribe(post("/api/newsletter", { body: { email: "fern@example.com" } }));
    const first = await confirmationToken("fern@example.com");
    expect(JSON.stringify(await AuthToken.find().lean())).not.toContain(first);

    await Subscriber.updateOne({ email: "fern@example.com" }, { status: "unsubscribed" });
    await subscribe(
      post("/api/newsletter", { body: { email: "fern@example.com" }, ip: "198.51.100.77" }),
    );
    const second = await confirmationToken("fern@example.com");
    expect(second).not.toBe(first);
    expect(
      (await confirm(post("/api/newsletter/confirm", { body: { token: first } }))).status,
    ).toBe(400);
    expect(
      (await confirm(post("/api/newsletter/confirm", { body: { token: second } }))).status,
    ).toBe(200);
  });
});

describe("POST /api/newsletter/unsubscribe", () => {
  beforeEach(async () => {
    await Subscriber.create({
      email: "member@example.com",
      status: "subscribed",
      source: "footer",
      consentAt: new Date(),
    });
  });

  it("supports RFC 8058 one-click (token in the URL, no Origin, form body) and is idempotent", async () => {
    const token = encodeURIComponent(createUnsubscribeToken("member@example.com"));
    const request = () =>
      new NextRequest(`${ORIGIN}/api/newsletter/unsubscribe?token=${token}`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "203.0.113.50",
        },
        body: "List-Unsubscribe=One-Click",
      });
    expect((await unsubscribe(request())).status).toBe(200);
    expect(await Subscriber.findOne({ email: "member@example.com" }).lean()).toMatchObject({
      status: "unsubscribed",
    });
    expect((await unsubscribe(request())).status).toBe(200);
  });

  it("works from the confirmation page (JSON body) and also clears the account's marketing preference", async () => {
    await User.create({
      email: "member@example.com",
      passwordHash: "x",
      firstName: "M",
      lastName: "M",
      acceptsMarketing: true,
    });
    const token = createUnsubscribeToken("member@example.com");
    expect(
      (await unsubscribe(post("/api/newsletter/unsubscribe", { body: { token }, origin: null })))
        .status,
    ).toBe(200);
    expect((await User.findOne({ email: "member@example.com" }).lean())?.acceptsMarketing).toBe(
      false,
    );
  });

  it("rejects forged, tampered and cross-address tokens", async () => {
    const good = createUnsubscribeToken("member@example.com");
    const [encoded, mac] = good.split(".");
    const forOther = `${Buffer.from("victim@example.com").toString("base64url")}.${mac}`;
    for (const bad of [forOther, `${encoded}.AAAA`, "garbage", `${good}.extra`, "x".repeat(500)]) {
      const response = await unsubscribe(
        post("/api/newsletter/unsubscribe", { body: { token: bad }, origin: null }),
      );
      expect(response.status).toBe(400);
    }
    expect(await Subscriber.findOne({ email: "member@example.com" }).lean()).toMatchObject({
      status: "subscribed",
    });
    expect(readUnsubscribeToken(good)).toBe("member@example.com");
  });

  it("requires a token", async () => {
    expect((await unsubscribe(post("/api/newsletter/unsubscribe", { origin: null }))).status).toBe(
      400,
    );
  });
});

describe("account marketing preference stays in sync with the list", () => {
  const registration = {
    email: "ada@example.com",
    password: "correct horse battery",
    firstName: "Ada",
    lastName: "L",
    acceptsMarketing: true,
  };
  const tokenFor = async (template: string) => {
    const job = await EmailJob.findOne({ template }).sort({ createdAt: -1 }).lean();
    return new URL(String((job?.data as { url: string }).url)).searchParams.get("token")!;
  };

  it("subscribes only after the mailbox is verified, and unsubscribes when the preference is switched off", async () => {
    const { user } = await registerUser(registration, { ip: "203.0.113.1", userAgent: "t" });
    expect(await Subscriber.countDocuments()).toBe(0); // ticked at sign-up, but not yet proven

    await confirmEmailVerification(await tokenFor("verify-email"));
    expect(await Subscriber.findOne({ email: "ada@example.com" }).lean()).toMatchObject({
      status: "subscribed",
      source: "account",
    });

    await updateProfile(user.id, { acceptsMarketing: false });
    expect(await Subscriber.findOne({ email: "ada@example.com" }).lean()).toMatchObject({
      status: "unsubscribed",
    });
    await updateProfile(user.id, { acceptsMarketing: true });
    expect(await Subscriber.findOne({ email: "ada@example.com" }).lean()).toMatchObject({
      status: "subscribed",
    });
  });

  it("an unverified account cannot opt itself onto the list from settings", async () => {
    const { user } = await registerUser(
      { ...registration, acceptsMarketing: false },
      { ip: "203.0.113.2", userAgent: "t" },
    );
    await updateProfile(user.id, { acceptsMarketing: true });
    expect(await Subscriber.countDocuments()).toBe(0);
  });
});

describe("campaigns", () => {
  const campaign = {
    campaignId: "spring-2026",
    subject: "Spring is here",
    heading: "New arrivals",
    paragraphs: ["Fresh plants are in.", "Come say hi."],
  };

  it("queues one email per confirmed subscriber only, idempotently, with working unsubscribe links", async () => {
    await Subscriber.create([
      { email: "a@example.com", status: "subscribed", source: "footer", consentAt: new Date() },
      { email: "b@example.com", status: "subscribed", source: "footer", consentAt: new Date() },
      { email: "pending@example.com", status: "pending", source: "footer", consentAt: new Date() },
      {
        email: "gone@example.com",
        status: "unsubscribed",
        source: "footer",
        consentAt: new Date(),
      },
    ]);

    expect(await enqueueCampaign(campaign)).toEqual({ queued: 2, skipped: 0 });
    expect(await EmailJob.distinct("to", { template: "campaign" })).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(await enqueueCampaign(campaign)).toEqual({ queued: 0, skipped: 2 }); // re-running never double-sends

    const job = await EmailJob.findOne({ to: "a@example.com" }).lean();
    const data = job?.data as { unsubscribeUrl: string; oneClickUrl: string };
    const token = new URL(data.unsubscribeUrl).searchParams.get("token")!;
    expect(readUnsubscribeToken(token)).toBe("a@example.com");
    expect(new URL(data.oneClickUrl).pathname).toBe("/api/newsletter/unsubscribe");
  });

  it("renders with List-Unsubscribe headers, an unsubscribe link, and escapes copy", async () => {
    const data = {
      ...campaign,
      heading: "<script>alert(1)</script>",
      paragraphs: ["Hello <b>there</b>"],
      cta: { label: "Shop now", url: "https://fernwood.example/shop" },
      unsubscribeUrl: "https://fernwood.example/unsubscribe?token=t",
      oneClickUrl: "https://fernwood.example/api/newsletter/unsubscribe?token=t",
    };
    const email = await renderEmail("campaign", data);
    expect(email.subject).toBe("Spring is here");
    expect(email.headers).toEqual({
      "List-Unsubscribe": "<https://fernwood.example/api/newsletter/unsubscribe?token=t>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(email.html).toContain("Unsubscribe");
    expect(email.html).not.toContain("<script>alert(1)");
    expect(email.html).not.toContain("<b>there</b>");
    await expect(
      renderEmail("campaign", { ...data, cta: { label: "x", url: "http://evil.example" } }),
    ).rejects.toThrow();
    await expect(renderEmail("campaign", { ...data, paragraphs: [] })).rejects.toThrow();
  });
});
