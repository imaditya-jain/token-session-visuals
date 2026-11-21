// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { disconnectDb } from "@/server/db/connection";
import { EmailJob } from "@/server/db/models/email-job";
import { RateLimit } from "@/server/db/models/rate-limit";
import { setTransportForTests } from "@/server/email/mailer";
import { processEmailJob } from "@/server/email/outbox";
import { startTestDatabase } from "@/test/mongo";

import { POST } from "./route";

const ORIGIN = "http://localhost:3100";
let server: MongoMemoryServer;

beforeAll(async () => {
  server = await startTestDatabase();
}, 120_000);
afterAll(async () => {
  setTransportForTests(undefined);
  await disconnectDb();
  await server.stop();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  const { connectDb } = await import("@/server/db/connection");
  await connectDb();
  await Promise.all([EmailJob.deleteMany({}), RateLimit.deleteMany({})]);
});

const message = {
  businessName: "Green Corner Café",
  contactName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+91 98765 43210",
  businessType: "Café or restaurant",
  location: "Pune, India",
  taxId: "27ABCDE1234F1Z5",
  message: "We want 40 plants for a new café and ongoing monthly supply.",
};

const post = (body: unknown, { ip = "198.51.100.20", origin = ORIGIN as string | null } = {}) =>
  new NextRequest(`${ORIGIN}/api/wholesale`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });

describe("POST /api/wholesale", () => {
  it("queues one email to the shop inbox with the applicant as reply-to", async () => {
    const response = await POST(post(message));
    expect(response.status).toBe(202);
    const jobs = await EmailJob.find({}).lean();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ template: "wholesale-application", to: "shop@example.com" });

    const sendMail = vi.fn().mockResolvedValue({});
    setTransportForTests({ sendMail });
    expect(await processEmailJob(jobs[0]!._id)).toBe("sent");
    expect(sendMail.mock.calls[0]?.[0]).toMatchObject({
      to: "shop@example.com",
      replyTo: "ada@example.com",
      subject: "Wholesale application: Green Corner Café",
    });
    expect(sendMail.mock.calls[0]?.[0].html).toContain("Green Corner");
  });

  it("never emails the visitor (no reflection or mail-bombing)", async () => {
    await POST(post(message));
    const recipients = (await EmailJob.find({}).lean()).map((job) => job.to);
    expect(recipients).not.toContain("ada@example.com");
  });

  it("escapes HTML in the message", async () => {
    await POST(post({ ...message, message: "<img src=x onerror=alert(1)> hello there" }));
    const [job] = await EmailJob.find({}).lean();
    const sendMail = vi.fn().mockResolvedValue({});
    setTransportForTests({ sendMail });
    await processEmailJob(job!._id);
    expect(sendMail.mock.calls[0]?.[0].html).not.toContain("<img src=x");
  });

  it("silently drops honeypot submissions", async () => {
    const response = await POST(post({ ...message, website: "https://spam.example" }));
    expect(response.status).toBe(202);
    expect(await EmailJob.countDocuments()).toBe(0);
  });

  it.each([
    ["header injection", { businessName: "Cafe\r\nBcc: x@example.com" }],
    ["bad email", { email: "nope" }],
    ["bad business type", { businessType: "other" }],
    ["bad phone", { phone: "call me" }],
    ["short message", { message: "hi" }],
  ])("rejects %s with 400", async (_n, patch) => {
    const response = await POST(post({ ...message, ...patch }));
    expect(response.status).toBe(400);
    expect(await EmailJob.countDocuments()).toBe(0);
  });

  it("blocks cross-origin posts", async () => {
    expect((await POST(post(message, { origin: "https://evil.example" }))).status).toBe(403);
    expect(await EmailJob.countDocuments()).toBe(0);
  });

  it("limits each IP to 5 and each address to 3 per hour", async () => {
    for (let i = 0; i < 3; i++)
      expect((await POST(post(message, { ip: `203.0.113.${i + 1}` }))).status).toBe(202);
    expect((await POST(post(message, { ip: "203.0.113.50" }))).status).toBe(429);

    for (let i = 0; i < 5; i++)
      await POST(post({ ...message, email: `p${i}@example.com` }, { ip: "203.0.113.99" }));
    const limited = await POST(
      post({ ...message, email: "p9@example.com" }, { ip: "203.0.113.99" }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});
