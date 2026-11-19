// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { disconnectDb } from "@/server/db/connection";
import { EmailJob } from "@/server/db/models/email-job";
import { startTestDatabase } from "@/test/mongo";

import { setTransportForTests } from "./mailer";
import { drainDueEmailJobs, enqueueEmail, processEmailJob } from "./outbox";

let server: MongoMemoryServer;
const sendMail = vi.fn();

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
  await EmailJob.deleteMany({});
  sendMail.mockReset().mockResolvedValue({});
  setTransportForTests({ sendMail });
});

afterEach(() => vi.useRealTimers());

const data = { firstName: "Ada", url: "https://fernwood.test/verify-email?token=abc" };

describe("outbox", () => {
  it("stores the job, sends branded HTML + plain text, then wipes the one-time link", async () => {
    const id = (await enqueueEmail("verify-email", "ada@example.com", data))!;
    expect(await processEmailJob(id)).toBe("sent");

    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0]![0];
    expect(message).toMatchObject({
      to: "ada@example.com",
      subject: "Confirm your Fernwood email",
    });
    expect(message.from).toEqual({ name: "Fernwood", address: "shop@example.com" });
    expect(message.html).toContain("https://fernwood.test/verify-email?token=abc");
    expect(message.html).toContain("#314329"); // forest button
    expect(message.html).toContain("Georgia");
    expect(message.text).toContain("https://fernwood.test/verify-email?token=abc");

    const job = await EmailJob.findById(id).lean();
    expect(job).toMatchObject({ status: "sent", attempts: 1 });
    expect(job?.data).toBeUndefined();
    expect(job?.expireAt).toBeInstanceOf(Date);
  });

  it("escapes user-controlled text so a hostile name cannot inject markup into the email", async () => {
    const id = (await enqueueEmail("verify-email", "x@example.com", {
      ...data,
      firstName: "<img src=x onerror=alert(1)>",
    }))!;
    await processEmailJob(id);
    const { html } = sendMail.mock.calls[0]![0];
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("rejects invalid template data before anything is stored", async () => {
    await expect(
      enqueueEmail("verify-email", "a@b.co", { firstName: "A", url: "not-a-url" }),
    ).rejects.toThrow();
    expect(await EmailJob.countDocuments()).toBe(0);
  });

  it("is idempotent per dedupe key", async () => {
    expect(
      await enqueueEmail("password-changed", "a@b.co", { firstName: "A" }, { dedupeKey: "k1" }),
    ).toBeTruthy();
    expect(
      await enqueueEmail("password-changed", "a@b.co", { firstName: "A" }, { dedupeKey: "k1" }),
    ).toBeNull();
    expect(await EmailJob.countDocuments()).toBe(1);
  });

  it("only one concurrent worker can claim and send a job", async () => {
    const id = (await enqueueEmail("password-changed", "a@b.co", { firstName: "A" }))!;
    const outcomes = await Promise.all([
      processEmailJob(id),
      processEmailJob(id),
      processEmailJob(id),
    ]);
    expect(outcomes.filter((o) => o === "sent")).toHaveLength(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("retries with backoff after an SMTP failure and succeeds later", async () => {
    sendMail.mockRejectedValueOnce(new Error("SMTP 421 try again later"));
    const id = (await enqueueEmail("password-changed", "a@b.co", { firstName: "A" }))!;

    expect(await processEmailJob(id)).toBe("retry");
    let job = await EmailJob.findById(id).lean();
    expect(job).toMatchObject({
      status: "pending",
      attempts: 1,
      lastError: "SMTP 421 try again later",
    });
    expect(job!.runAt.getTime()).toBeGreaterThan(Date.now() + 30_000);
    expect(await processEmailJob(id)).toBe("skipped"); // not due yet

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * 60_000);
    expect(await processEmailJob(id)).toBe("sent");
    job = await EmailJob.findById(id).lean();
    expect(job).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("gives up after 5 attempts, keeps the error and removes the payload", async () => {
    sendMail.mockRejectedValue(new Error("550 mailbox unavailable"));
    const id = (await enqueueEmail("verify-email", "gone@example.com", data))!;
    vi.useFakeTimers({ toFake: ["Date"] });
    const outcomes: string[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      outcomes.push(await processEmailJob(id));
      vi.setSystemTime(Date.now() + 7 * 3600_000);
    }
    expect(outcomes).toEqual(["retry", "retry", "retry", "retry", "failed"]);
    const job = await EmailJob.findById(id).lean();
    expect(job).toMatchObject({
      status: "failed",
      attempts: 5,
      lastError: "550 mailbox unavailable",
    });
    expect(job?.data).toBeUndefined();
    expect(await processEmailJob(id)).toBe("skipped");
  });

  it("the sweeper delivers due jobs and recovers jobs stuck in processing", async () => {
    const a = (await enqueueEmail("password-changed", "a@b.co", { firstName: "A" }))!;
    const b = (await enqueueEmail("password-changed", "b@b.co", { firstName: "B" }))!;
    // Simulate a worker that died mid-send: processing with an expired lock.
    await EmailJob.updateOne(
      { _id: b },
      { status: "processing", lockedUntil: new Date(Date.now() - 1000) },
    );

    expect(await drainDueEmailJobs()).toEqual({ attempted: 2, sent: 2 });
    expect((await EmailJob.findById(a).lean())?.status).toBe("sent");
    expect((await EmailJob.findById(b).lean())?.status).toBe("sent");
    expect(await drainDueEmailJobs()).toEqual({ attempted: 0, sent: 0 });
  });
});
