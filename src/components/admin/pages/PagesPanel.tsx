"use client";

import Link from "next/link";

import { useApiResource } from "@/components/account/useApiResource";
import PageHeader from "@/components/admin/PageHeader";
import Skeleton from "@/components/admin/Skeleton";
import StatusPill from "@/components/admin/StatusPill";
import { formatDateTime } from "@/lib/order-format";

type Row = {
  id: string;
  title: string;
  path: string;
  hasUnpublished: boolean;
  publishedAt: string | null;
};

export default function PagesPanel() {
  const resource = useApiResource<{ pages: Row[] }>("/api/admin/pages");
  return (
    <>
      <PageHeader
        title="Page content"
        lead="Edit the words, links and pictures of each storefront page, section by section. Nothing changes on the site until you publish."
      />
      {resource.status === "loading" ? (
        <Skeleton variant="list" rows={3} />
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
      ) : (
        <ul
          aria-label="Pages"
          className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60"
        >
          {resource.data.pages.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/site/pages/${p.id}`}
                className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <span>
                  <span className="font-medium text-forest">{p.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.path} ·{" "}
                    {p.publishedAt
                      ? `published ${formatDateTime(p.publishedAt)}`
                      : "showing the original content"}
                  </span>
                </span>
                {p.hasUnpublished ? <StatusPill label="Unpublished changes" tone="warn" /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
