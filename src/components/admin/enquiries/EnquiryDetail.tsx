"use client";

import { useState, type FormEvent } from "react";

import { useApiResource } from "@/components/account/useApiResource";
import { useAdminMutation } from "@/components/admin/useAdminApi";
import { Button } from "@/components/ui/button";
import {
  ENQUIRY_STATUSES,
  STATUS_LABELS,
  type EnquiryDetail as Detail,
  type EnquiryStatus,
} from "@/lib/enquiries";
import { useAppSelector } from "@/store/hooks";

const when = (iso: string) =>
  new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

const select =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

/** One enquiry in full: sender, message, working controls (status, owner, archive), notes and history. */
export default function EnquiryDetail({
  id,
  assignees,
  onChanged,
  onDeleted,
}: {
  id: string;
  assignees: { id: string; name: string }[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const permissions = useAppSelector((s) => s.admin.access?.permissions ?? []);
  const canWrite = permissions.includes("enquiries:write");
  const canDelete = permissions.includes("enquiries:delete");
  const resource = useApiResource<{ enquiry: Detail }>(`/api/admin/enquiries/${id}`);
  const mutation = useAdminMutation();
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (resource.status === "loading") {
    return (
      <p role="status" className="mt-6 text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (resource.status === "error") {
    return (
      <div role="alert" className="mt-6 text-sm text-destructive">
        {resource.message}{" "}
        <button className="underline" onClick={resource.retry}>
          Try again
        </button>
      </div>
    );
  }
  const e = resource.data.enquiry;

  const update = async (patch: Record<string, unknown>) => {
    if (await mutation.run(`/api/admin/enquiries/${id}`, "PATCH", patch)) {
      resource.retry();
      onChanged();
    }
  };
  const submitNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    if (await mutation.run(`/api/admin/enquiries/${id}/notes`, "POST", { text: note })) {
      setNote("");
      resource.retry();
      onChanged();
    }
  };
  const remove = async () => {
    if (await mutation.run(`/api/admin/enquiries/${id}`, "DELETE")) onDeleted();
  };

  const subject = encodeURIComponent(`Re: ${e.headline || "Your enquiry"} [${e.reference}]`);

  return (
    <div className="mt-6 space-y-7">
      <section aria-label="Sender and message">
        <dl>
          <Row label="Reference">{e.reference}</Row>
          <Row label="Received">{when(e.createdAt)}</Row>
          <Row label="Name">{e.name}</Row>
          <Row label="Email">
            <a
              className="text-forest underline underline-offset-4"
              href={`mailto:${e.email}?subject=${subject}`}
            >
              {e.email}
            </a>
          </Row>
          {e.phone ? (
            <Row label="Phone">
              <a
                className="text-forest underline underline-offset-4"
                href={`tel:${e.phone.replace(/[^\d+]/g, "")}`}
              >
                {e.phone}
              </a>
            </Row>
          ) : null}
          {e.topic ? <Row label="Topic">{e.topic}</Row> : null}
          {e.businessName ? <Row label="Business">{e.businessName}</Row> : null}
          {e.businessType ? <Row label="Type">{e.businessType}</Row> : null}
          {e.location ? <Row label="Location">{e.location}</Row> : null}
          {e.taxId ? <Row label="Tax ID">{e.taxId}</Row> : null}
        </dl>
        <p className="mb-1 mt-4 text-sm text-muted-foreground">Message</p>
        <p className="whitespace-pre-wrap rounded-lg bg-background p-4 text-sm ring-1 ring-border/60">
          {e.message}
        </p>
        <Button asChild variant="outline" className="mt-3 h-11">
          <a href={`mailto:${e.email}?subject=${subject}`}>Reply by email</a>
        </Button>
      </section>

      {mutation.error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {mutation.error}
        </p>
      ) : null}

      {canWrite ? (
        <section aria-label="Handling" className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="enq-status" className="mb-1.5 block text-sm font-medium">
              Status
            </label>
            <select
              id="enq-status"
              className={select}
              value={e.status}
              disabled={mutation.pending}
              onChange={(event) => void update({ status: event.target.value })}
            >
              {ENQUIRY_STATUSES[e.kind].map((status: EnquiryStatus) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="enq-assignee" className="mb-1.5 block text-sm font-medium">
              Assigned to
            </label>
            <select
              id="enq-assignee"
              className={select}
              value={e.assignedTo ?? ""}
              disabled={mutation.pending}
              onChange={(event) => void update({ assignedTo: event.target.value || null })}
            >
              <option value="">Nobody</option>
              {assignees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button
              variant="outline"
              className="h-11"
              disabled={mutation.pending}
              onClick={() => void update({ archived: !e.archived })}
            >
              {e.archived ? "Restore from archive" : "Archive"}
            </Button>
            {canDelete && e.archived ? (
              confirmDelete ? (
                <Button
                  variant="destructive"
                  className="h-11"
                  disabled={mutation.pending}
                  onClick={() => void remove()}
                >
                  Confirm: delete permanently
                </Button>
              ) : (
                <Button variant="outline" className="h-11" onClick={() => setConfirmDelete(true)}>
                  Delete permanently
                </Button>
              )
            ) : null}
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          {STATUS_LABELS[e.status]}
          {e.assignedToName ? ` · assigned to ${e.assignedToName}` : ""}
        </p>
      )}

      <section aria-labelledby="notes-heading">
        <h3 id="notes-heading" className="mb-3 font-display text-lg text-forest">
          Internal notes
        </h3>
        {e.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No notes yet. Notes are only visible to your team.
          </p>
        ) : (
          <ul className="space-y-3">
            {e.notes.map((n) => (
              <li key={n.id} className="rounded-lg bg-background p-3 ring-1 ring-border/60">
                <p className="whitespace-pre-wrap text-sm">{n.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.authorName} · {when(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <form onSubmit={submitNote} className="mt-4">
            <label htmlFor="enq-note" className="mb-1.5 block text-sm font-medium">
              Add a note
            </label>
            <textarea
              id="enq-note"
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" className="mt-2 h-11" disabled={mutation.pending || !note.trim()}>
              Save note
            </Button>
          </form>
        ) : null}
      </section>

      <section aria-labelledby="history-heading">
        <h3 id="history-heading" className="mb-3 font-display text-lg text-forest">
          History
        </h3>
        <ol className="space-y-1.5 text-sm">
          {e.history.map((entry, index) => (
            <li key={index}>
              <span className="font-medium">{STATUS_LABELS[entry.status]}</span>{" "}
              <span className="text-muted-foreground">
                · {entry.byName} · {when(entry.at)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
