import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { drainDueEmailJobs } from "@/server/email/outbox";
import { drainDueJobs } from "@/server/queue/jobs";
import { route } from "@/server/http/handler";
import { forbidden } from "@/server/http/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Background sweeper (Vercel Cron). Delivers due or stuck email jobs. Not a public endpoint: requires
 * `Authorization: Bearer $CRON_SECRET` (Vercel sends it automatically) and fails closed without a secret.
 */
export const GET = route(async ({ request }) => {
  const secret = process.env["CRON_SECRET"];
  if (!secret)
    return NextResponse.json(
      { error: { code: "not_configured", message: "Cron not configured" } },
      { status: 503 },
    );
  if (!safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`))
    throw forbidden("Forbidden");
  const [emails, jobs] = [await drainDueEmailJobs(), await drainDueJobs()];
  return NextResponse.json({ data: { ...emails, jobs } });
});
