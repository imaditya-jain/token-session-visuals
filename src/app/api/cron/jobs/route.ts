import { NextResponse } from "next/server";

import { drainDueEmailJobs } from "@/server/email/outbox";
import { drainDueJobs } from "@/server/queue/jobs";
import { enqueueMirrorBackfill } from "@/server/queue/producers";
import { revalidateBlog } from "@/server/blog/revalidate";
import { sweepReels } from "@/server/services/reels";
import { sendDueCampaigns } from "@/server/services/campaigns";
import { publishDuePosts } from "@/server/services/blog-admin";
import { route } from "@/server/http/handler";
import { assertBearerSecret } from "@/server/http/secret";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Background sweeper (Vercel Cron). Delivers due or stuck email jobs. Not a public endpoint: requires
 * `Authorization: Bearer $CRON_SECRET` (Vercel sends it automatically) and fails closed without a secret.
 */
export const GET = route(async ({ request }) => {
  if (!assertBearerSecret(request, process.env["CRON_SECRET"]))
    return NextResponse.json(
      { error: { code: "not_configured", message: "Cron not configured" } },
      { status: 503 },
    );
  // Daily safety net for missed webhooks: queue a full pass, then run whatever is due.
  await enqueueMirrorBackfill();
  const [emails, jobs] = [await drainDueEmailJobs(), await drainDueJobs()];
  // Scheduled posts whose time has come: keep their status honest and refresh the public pages.
  const published = await publishDuePosts();
  if (published > 0) revalidateBlog();
  // Campaigns scheduled for now (or interrupted mid-send): queue their emails, then deliver what is due.
  const campaignsSent = await sendDueCampaigns();
  const reelsSwept = await sweepReels();
  return NextResponse.json({
    data: { ...emails, jobs, postsPublished: published, campaignsSent, reelsSwept },
  });
});
