"use client";

import Link from "next/link";
import { useState } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import PageHeader from "@/components/admin/PageHeader";
import Skeleton from "@/components/admin/Skeleton";
import StatusPill from "@/components/admin/StatusPill";
import { Button } from "@/components/ui/button";
import { CAMPAIGN_STATUSES, type CampaignListItem, type CampaignStatus } from "@/lib/campaigns";
import { findDesign } from "@/lib/email-designs";
import { formatDateTime, statusLabel, type Tone } from "@/lib/order-format";
import { useAppSelector } from "@/store/hooks";

const tone = (s: CampaignStatus): Tone =>
  s === "sent" ? "good" : s === "draft" ? "neutral" : "warn";

export default function CampaignsPanel() {
  const canWrite = useAppSelector(
    (s) => s.admin.access?.permissions.includes("campaigns:write") ?? false,
  );
  const [status, setStatus] = useState<CampaignStatus | "">("");
  const resource = useApiResource<{ campaigns: CampaignListItem[] }>(
    `/api/admin/campaigns${status ? `?status=${status}` : ""}`,
  );
  const audience = useApiResource<{ subscribers: number }>("/api/admin/campaigns/audience");
  return (
    <>
      <PageHeader
        title="Campaigns"
        lead={
          audience.status === "ready"
            ? `Email your newsletter subscribers. ${audience.data.subscribers} confirmed ${audience.data.subscribers === 1 ? "subscriber" : "subscribers"} will receive a campaign.`
            : "Email your newsletter subscribers."
        }
        action={
          canWrite ? (
            <Button asChild className="h-11">
              <Link href="/admin/marketing/campaigns/new">New campaign</Link>
            </Button>
          ) : undefined
        }
      />
      <div role="tablist" aria-label="Campaign views" className="mb-4 flex flex-wrap gap-2">
        {(
          [["", "All"], ...CAMPAIGN_STATUSES.map((s) => [s, statusLabel(s)] as const)] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={status === id}
            onClick={() => setStatus(id as CampaignStatus | "")}
            className={`min-h-11 rounded-full px-4 text-sm ${status === id ? "bg-forest text-cream" : "bg-card ring-1 ring-border hover:bg-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {resource.status === "loading" ? (
        <Skeleton variant="list" rows={4} />
      ) : resource.status === "error" ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {resource.message}{" "}
          <button className="underline" onClick={resource.retry}>
            Try again
          </button>
        </p>
      ) : resource.data.campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground">No campaigns here yet.</p>
      ) : (
        <ul
          aria-label="Campaigns"
          className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60"
        >
          {resource.data.campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/marketing/campaigns/${c.id}`}
                className="grid min-h-16 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-forest">{c.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.subject} · {findDesign(c.design)?.name ?? c.design}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {c.status === "sent" && c.sentAt
                      ? `Sent ${formatDateTime(c.sentAt)}`
                      : c.status === "scheduled" && c.scheduledAt
                        ? `Goes out ${formatDateTime(c.scheduledAt)}`
                        : `Edited ${formatDateTime(c.updatedAt)}`}
                    {c.stats
                      ? ` · ${c.stats.delivered} delivered, ${c.stats.failed} failed, ${c.stats.pending} waiting`
                      : ""}
                  </span>
                </span>
                <StatusPill label={statusLabel(c.status)} tone={tone(c.status)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
