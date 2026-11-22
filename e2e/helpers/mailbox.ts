import { readFileSync } from "node:fs";

import type { APIRequestContext, APIResponse, Page } from "@playwright/test";
import { MongoClient } from "mongodb";

export type Runtime = {
  mongoUri: string;
  dbName: string;
  webhookSecret: string;
  cronSecret: string;
};

export const runtime = (): Runtime =>
  JSON.parse(readFileSync(".e2e-runtime.json", "utf8")) as Runtime;

/**
 * The e2e server cannot deliver email (SMTP is a closed port), so queued jobs keep their payload. This reads
 * the most recent link emailed to an address, exactly as a person would click it in their inbox.
 */
export async function latestEmailLink(template: string, to: string): Promise<string> {
  const { mongoUri, dbName } = runtime();
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const jobs = client.db(dbName).collection("emailjobs");
    for (let attempt = 0; attempt < 40; attempt++) {
      const job = await jobs.findOne({ template, to }, { sort: { createdAt: -1 } });
      const url = (job?.["data"] as { url?: string } | undefined)?.url;
      if (url) return url;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`No "${template}" email found for ${to}`);
  } finally {
    await client.close();
  }
}

/** Test emails link to SITE_URL; rewrite the origin to the server under test. */
export const toLocal = (url: string, baseURL: string): string => {
  const parsed = new URL(url);
  return `${baseURL.replace(/\/$/, "")}${parsed.pathname}${parsed.search}`;
};

/** Gives an account order-update notifications, as the order sync would after Shopify webhooks (none exist in e2e). */
export async function seedNotifications(
  email: string,
  items: { title: string; body: string; link: string }[],
): Promise<void> {
  const { mongoUri, dbName } = runtime();
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const user = await db.collection("users").findOne({ email });
    if (!user) throw new Error(`No account for ${email}`);
    const now = Date.now();
    await db.collection("notifications").insertMany(
      items.map((item, index) => ({
        userId: user["_id"],
        kind: "order.shipped",
        ...item,
        dedupeKey: `e2e:${email}:${index}`,
        createdAt: new Date(now - index * 60_000),
        expireAt: new Date(now + 86_400_000),
      })),
    );
  } finally {
    await client.close();
  }
}

/** The most recent sign-in code emailed to an address after `since` (the e2e server cannot deliver mail). */
export async function latestOtpCode(to: string, since: Date): Promise<string> {
  const { mongoUri, dbName } = runtime();
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const jobs = client.db(dbName).collection("emailjobs");
    for (let attempt = 0; attempt < 40; attempt++) {
      const job = await jobs.findOne(
        { template: "otp-code", to, createdAt: { $gte: since } },
        { sort: { createdAt: -1 } },
      );
      const code = (job?.["data"] as { code?: string } | undefined)?.code;
      if (code) return code;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`No sign-in code emailed to ${to}`);
  } finally {
    await client.close();
  }
}

/** Submits the credentials already typed on /login, then types the emailed code like a person would. */
export async function submitLoginAndEnterCode(page: Page, email: string): Promise<void> {
  const since = new Date(Date.now() - 1000);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const code = await latestOtpCode(email, since);
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
}

/** Sign-in over the API (password, then code), for tests that only need a session. */
export async function apiLogin(
  request: APIRequestContext,
  origin: string,
  email: string,
  password: string,
  headers: Record<string, string> = {},
): Promise<APIResponse> {
  const since = new Date(Date.now() - 1000);
  const first = await request.post("/api/auth/login", {
    data: { email, password },
    headers: { origin, ...headers },
  });
  if (first.status() !== 200) return first;
  const { ref } = (await first.json()).data as { ref: string };
  return request.post("/api/auth/otp/verify", {
    data: { challenge: ref, code: await latestOtpCode(email, since) },
    headers: { origin, ...headers },
  });
}
