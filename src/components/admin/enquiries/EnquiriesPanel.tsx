"use client";

import { useState, type FormEvent } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import EnquiryDetail from "@/components/admin/enquiries/EnquiryDetail";
import PageHeader from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { apiDownload } from "@/lib/api-client";
import {
  ENQUIRY_STATUSES,
  KIND_LABELS,
  STATUS_LABELS,
  type EnquiryCounts,
  type EnquiryKind,
  type EnquiryListItem,
} from "@/lib/enquiries";
import { useAppSelector } from "@/store/hooks";
import Skeleton from "@/components/admin/Skeleton";

const PER_PAGE = 20;

const when = (iso: string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

const badge: Record<string, string> = {
  new: "bg-clay/15 text-clay-deep",
  in_progress: "bg-sage-light text-forest",
  in_review: "bg-sage-light text-forest",
  resolved: "bg-muted text-muted-foreground",
  approved: "bg-forest text-cream",
  rejected: "bg-muted text-muted-foreground",
};

export default function EnquiriesPanel({ kind }: { kind: EnquiryKind }) {
  const permissions = useAppSelector((s) => s.admin.access?.permissions ?? []);
  const canExport = permissions.includes("enquiries:export");
  const labels = KIND_LABELS[kind];

  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [assignee, setAssignee] = useState("");
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const query = new URLSearchParams({ kind, page: String(page), perPage: String(PER_PAGE) });
  if (status) query.set("status", status);
  if (search) query.set("search", search);
  if (assignee) query.set("assignee", assignee);
  if (archived) query.set("archived", "1");

  const list = useApiResource<{ items: EnquiryListItem[]; total: number; counts: EnquiryCounts }>(
    `/api/admin/enquiries?${query.toString()}`,
  );
  const people = useApiResource<{ assignees: { id: string; name: string }[] }>(
    "/api/admin/enquiries/assignees",
  );
  const assignees = people.status === "ready" ? people.data.assignees : [];

  const data = list.status === "ready" ? list.data : null;
  const pages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const exportCsv = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const exportQuery = new URLSearchParams({ kind });
      if (status) exportQuery.set("status", status);
      if (search) exportQuery.set("search", search);
      if (assignee) exportQuery.set("assignee", assignee);
      if (archived) exportQuery.set("archived", "1");
      const { blob, filename } = await apiDownload(
        `/api/admin/enquiries/export?${exportQuery.toString()}`,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setExportError("Couldn't export. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const tabs: { key: string; label: string }[] = [
    { key: "", label: "All" },
    ...ENQUIRY_STATUSES[kind].map((s) => ({ key: s, label: STATUS_LABELS[s] })),
  ];

  return (
    <>
      <PageHeader
        title={labels.plural}
        lead={
          kind === "wholesale"
            ? "Trade applications from the website. Review them, add notes, and approve or decline."
            : "Messages sent through the website's contact form."
        }
        action={
          canExport ? (
            <Button
              variant="outline"
              className="h-11"
              disabled={exporting}
              onClick={() => void exportCsv()}
            >
              {exporting ? "Preparing…" : "Export CSV"}
            </Button>
          ) : undefined
        }
      />
      {exportError ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {exportError}
        </p>
      ) : null}

      <nav
        aria-label={`${labels.singular} status`}
        className="mb-5 flex flex-wrap gap-x-5 gap-y-1 border-b border-border"
      >
        {tabs.map((tab) => {
          const active = status === tab.key;
          const count = tab.key === "" ? data?.counts.all : data?.counts[tab.key];
          return (
            <button
              key={tab.key || "all"}
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => {
                setStatus(tab.key);
                setPage(1);
              }}
              className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-semibold ${
                active
                  ? "border-clay text-forest"
                  : "border-transparent text-muted-foreground hover:text-forest"
              }`}
            >
              {tab.label}
              {count !== undefined ? <span className="ml-1.5 font-normal">({count})</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="enq-filter-assignee" className="mb-1 block text-xs text-muted-foreground">
            Assigned to
          </label>
          <select
            id="enq-filter-assignee"
            value={assignee}
            onChange={(event) => {
              setAssignee(event.target.value);
              setPage(1);
            }}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Anyone</option>
            <option value="me">Me</option>
            <option value="unassigned">Unassigned</option>
            {assignees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--forest)]"
            checked={archived}
            onChange={(event) => {
              setArchived(event.target.checked);
              setPage(1);
            }}
          />
          Show archived
        </label>
        <form onSubmit={submitSearch} role="search" className="ml-auto flex items-end gap-2">
          <div>
            <label htmlFor="enq-search" className="mb-1 block text-xs text-muted-foreground">
              Search
            </label>
            <input
              id="enq-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Name, email, reference…"
              className="h-11 w-48 rounded-md border border-input bg-background px-3 text-sm sm:w-64"
            />
          </div>
          <Button type="submit" variant="outline" className="h-11">
            Search
          </Button>
        </form>
      </div>

      {list.status === "loading" ? (
        <Skeleton variant="list" />
      ) : list.status === "error" ? (
        <div role="alert" className="text-sm text-destructive">
          {list.message}{" "}
          <button className="underline" onClick={list.retry}>
            Try again
          </button>
        </div>
      ) : data && data.items.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          {search || status || assignee || archived ? "Nothing matches." : "Nothing here yet."}
        </p>
      ) : data ? (
        <>
          <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-border/60">
            {data.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(item.id)}
                  className="flex w-full flex-wrap items-start gap-x-4 gap-y-2 px-4 py-4 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">
                      {item.headline || item.name}
                      <span className="sr-only"> from {item.name}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.name} · {item.email}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {item.preview}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-semibold ${badge[item.status] ?? ""}`}
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                    <span>{when(item.createdAt)}</span>
                    <span>
                      {item.reference}
                      {item.assignedToName ? ` · ${item.assignedToName}` : ""}
                      {item.noteCount
                        ? ` · ${item.noteCount} ${item.noteCount === 1 ? "note" : "notes"}`
                        : ""}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {pages > 1 ? (
            <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                className="h-11"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Button
                variant="outline"
                className="h-11"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}

      <Sheet open={openId !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetTitle className="font-display text-xl text-forest">{labels.singular}</SheetTitle>
          <SheetDescription className="sr-only">
            Details, status, notes and history
          </SheetDescription>
          {openId ? (
            <EnquiryDetail
              key={openId}
              id={openId}
              assignees={assignees}
              onChanged={list.retry}
              onDeleted={() => {
                setOpenId(null);
                list.retry();
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
