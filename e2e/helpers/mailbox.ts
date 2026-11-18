import { readFileSync } from "node:fs";

import { MongoClient } from "mongodb";

type Runtime = { mongoUri: string; dbName: string };

const runtime = (): Runtime => JSON.parse(readFileSync(".e2e-runtime.json", "utf8")) as Runtime;

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
