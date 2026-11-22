import "server-only";

import { randomInt } from "node:crypto";

import { Types } from "mongoose";

import { CONTACT_TOPICS } from "@/lib/contact-schemas";
import { toCsv } from "@/lib/csv";
import {
  ENQUIRY_STATUSES,
  isStatusOf,
  KIND_LABELS,
  STATUS_LABELS,
  type EnquiryCounts,
  type EnquiryDetail,
  type EnquiryKind,
  type EnquiryListItem,
  type EnquiryStatus,
} from "@/lib/enquiries";
import { BUSINESS_TYPES } from "@/lib/wholesale-schemas";
import { emailEnv } from "@/server/config/env";
import { connectDb } from "@/server/db/connection";
import { Enquiry, type EnquiryRecord } from "@/server/db/models/enquiry";
import { User } from "@/server/db/models/user";
import { enqueueEmail } from "@/server/email/outbox";
import { badRequest, notFound } from "@/server/http/errors";
import { logger } from "@/server/logger";

const PREFIX: Record<EnquiryKind, string> = { contact: "CT", wholesale: "WS" };
// No 0/O/1/I/L: references are read aloud and typed back.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newReference(kind: EnquiryKind, now = new Date()): string {
  const date = now.toISOString().slice(2, 10).replace(/-/g, "");
  const tail = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${PREFIX[kind]}-${date}-${tail}`;
}

export type NewEnquiry =
  | { kind: "contact"; name: string; email: string; topic: string; message: string }
  | {
      kind: "wholesale";
      name: string;
      email: string;
      phone: string;
      businessName: string;
      businessType: string;
      location: string;
      taxId: string;
      message: string;
    };

const isDuplicateKey = (error: unknown): boolean => (error as { code?: number }).code === 11000;

/**
 * Stores a submission, THEN tells the team and thanks the sender. Saving first means a message is never lost to an
 * email problem; the notifications go through the outbox, which retries. Returns the stored record.
 */
export async function recordEnquiry(input: NewEnquiry): Promise<EnquiryRecord> {
  await connectDb();
  let record: EnquiryRecord | undefined;
  for (let attempt = 0; attempt < 5 && !record; attempt++) {
    try {
      const created = await Enquiry.create({
        kind: input.kind,
        reference: newReference(input.kind),
        name: input.name,
        email: input.email,
        message: input.message,
        history: [{ status: "new", at: new Date() }],
        ...(input.kind === "contact"
          ? { topic: input.topic }
          : {
              phone: input.phone,
              businessName: input.businessName,
              businessType: input.businessType,
              location: input.location,
              ...(input.taxId ? { taxId: input.taxId } : {}),
            }),
      });
      record = created.toObject();
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  if (!record) throw new Error("Could not allocate an enquiry reference");
  await notify(record);
  return record;
}

async function notify(record: EnquiryRecord): Promise<void> {
  const id = String(record._id);
  try {
    const env = emailEnv();
    const inbox = env.CONTACT_INBOX ?? env.SMTP_EMAIL;
    if (record.kind === "contact") {
      await enqueueEmail(
        "contact-message",
        inbox,
        {
          name: record.name,
          email: record.email,
          topic: CONTACT_TOPICS.find((t) => t === record.topic) ?? "Something else",
          message: record.message,
          reference: record.reference,
        },
        { dedupeKey: `enquiry:${id}:notify` },
      );
    } else {
      await enqueueEmail(
        "wholesale-application",
        inbox,
        {
          businessName: record.businessName ?? "",
          contactName: record.name,
          email: record.email,
          phone: record.phone ?? "",
          businessType: BUSINESS_TYPES.find((t) => t === record.businessType) ?? "Other",
          location: record.location ?? "",
          taxId: record.taxId ?? "",
          message: record.message,
          reference: record.reference,
        },
        { dedupeKey: `enquiry:${id}:notify` },
      );
    }
    // One thank-you per address per day: the form can't be used to repeatedly mail a stranger's inbox.
    const day = new Date().toISOString().slice(0, 10);
    await enqueueEmail(
      "enquiry-received",
      record.email,
      { kind: record.kind, name: record.name, reference: record.reference },
      { dedupeKey: `enquiry-ack:${record.kind}:${record.email}:${day}` },
    );
  } catch (error) {
    // The enquiry is saved and visible in the admin; a failed notification must not turn into a lost message.
    logger.error(
      { err: error instanceof Error ? error : String(error), enquiryId: id },
      "Enquiry notification failed",
    );
  }
}

const preview = (text: string, max = 140): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

async function adminNames(ids: Types.ObjectId[]): Promise<Map<string, string>> {
  const users = await User.find({ _id: { $in: ids } }, { firstName: 1, lastName: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), `${u.firstName} ${u.lastName}`]));
}

type ListRow = Omit<EnquiryRecord, "notes" | "history">;

function toListItem(row: ListRow, names: Map<string, string>, noteCount: number): EnquiryListItem {
  return {
    id: String(row._id),
    kind: row.kind,
    reference: row.reference,
    status: row.status,
    name: row.name,
    email: row.email,
    headline: row.kind === "wholesale" ? (row.businessName ?? "") : (row.topic ?? ""),
    preview: preview(row.message),
    assignedToName: row.assignedTo
      ? (names.get(String(row.assignedTo)) ?? "Former team member")
      : null,
    archived: Boolean(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    noteCount,
  };
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type EnquiryFilter = {
  kind: EnquiryKind;
  status?: string | undefined;
  search?: string | undefined;
  /** "me" (needs `viewerId`), "unassigned", or a user id. */
  assignee?: string | undefined;
  archived: boolean;
  from?: Date | undefined;
  to?: Date | undefined;
};

function filterOf(filter: EnquiryFilter, viewerId?: string): Record<string, unknown> {
  const query: Record<string, unknown> = {
    kind: filter.kind,
    archivedAt: filter.archived ? { $exists: true } : { $exists: false },
  };
  if (filter.status) {
    if (!isStatusOf(filter.kind, filter.status))
      throw badRequest("Unknown status.", "invalid_status");
    query["status"] = filter.status;
  }
  const search = filter.search?.trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: "i" };
    query["$or"] = [
      { name: rx },
      { email: rx },
      { businessName: rx },
      { reference: rx },
      { message: rx },
      { topic: rx },
    ];
  }
  if (filter.assignee === "unassigned") query["assignedTo"] = { $exists: false };
  else if (filter.assignee === "me" && viewerId) query["assignedTo"] = new Types.ObjectId(viewerId);
  else if (filter.assignee && Types.ObjectId.isValid(filter.assignee))
    query["assignedTo"] = new Types.ObjectId(filter.assignee);
  if (filter.from || filter.to) {
    query["createdAt"] = {
      ...(filter.from ? { $gte: filter.from } : {}),
      ...(filter.to ? { $lte: filter.to } : {}),
    };
  }
  return query;
}

export async function listEnquiries(
  filter: EnquiryFilter,
  page: number,
  perPage: number,
  viewerId?: string,
): Promise<{ items: EnquiryListItem[]; total: number; counts: EnquiryCounts }> {
  await connectDb();
  const query = filterOf(filter, viewerId);
  const countsBase = {
    kind: filter.kind,
    archivedAt: filter.archived ? { $exists: true } : { $exists: false },
  };
  const [rows, total, grouped] = await Promise.all([
    Enquiry.find(query, { notes: 0, history: 0 })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean(),
    Enquiry.countDocuments(query),
    Enquiry.aggregate<{ _id: EnquiryStatus; count: number }>([
      { $match: countsBase },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);
  // The list omits the notes array; count them separately for the badge.
  const noteCounts = new Map(
    (
      await Enquiry.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { _id: { $in: rows.map((r) => r._id) } } },
        { $project: { n: { $size: "$notes" } } },
      ])
    ).map((r) => [String(r._id), r.n]),
  );
  const names = await adminNames(rows.flatMap((r) => (r.assignedTo ? [r.assignedTo] : [])));
  const counts: EnquiryCounts = { all: 0 };
  for (const status of ENQUIRY_STATUSES[filter.kind]) counts[status] = 0;
  for (const row of grouped) {
    counts[row._id] = row.count;
    counts.all += row.count;
  }
  return {
    items: rows.map((row) => toListItem(row, names, noteCounts.get(String(row._id)) ?? 0)),
    total,
    counts,
  };
}

const toId = (value: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(value)) throw notFound("Enquiry not found", "enquiry_not_found");
  return new Types.ObjectId(value);
};

export async function getEnquiry(id: string): Promise<EnquiryDetail> {
  await connectDb();
  const row = await Enquiry.findById(toId(id)).lean();
  if (!row) throw notFound("Enquiry not found", "enquiry_not_found");
  const ids = [
    ...(row.assignedTo ? [row.assignedTo] : []),
    ...row.history.flatMap((h) => (h.by ? [h.by] : [])),
  ];
  const names = await adminNames(ids);
  return {
    ...toListItem(row, names, row.notes.length),
    phone: row.phone ?? null,
    topic: row.topic ?? null,
    businessName: row.businessName ?? null,
    businessType: row.businessType ?? null,
    location: row.location ?? null,
    taxId: row.taxId ?? null,
    message: row.message,
    assignedTo: row.assignedTo ? String(row.assignedTo) : null,
    notes: row.notes.map((n) => ({
      id: String(n._id),
      authorId: String(n.authorId),
      authorName: n.authorName,
      text: n.text,
      createdAt: n.createdAt.toISOString(),
    })),
    history: row.history.map((h) => ({
      status: h.status,
      byName: h.by ? (names.get(String(h.by)) ?? "Former team member") : "Website",
      at: h.at.toISOString(),
    })),
  };
}

export type EnquiryPatch = {
  status?: string | undefined;
  assignedTo?: string | null | undefined;
  archived?: boolean | undefined;
};

export async function updateEnquiry(
  actorId: string,
  id: string,
  patch: EnquiryPatch,
): Promise<EnquiryDetail> {
  await connectDb();
  const _id = toId(id);
  const row = await Enquiry.findById(_id).lean();
  if (!row) throw notFound("Enquiry not found", "enquiry_not_found");

  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  let push: Record<string, unknown> | undefined;

  if (patch.status !== undefined && patch.status !== row.status) {
    if (!isStatusOf(row.kind, patch.status))
      throw badRequest("That status doesn't apply to this enquiry.", "invalid_status");
    set["status"] = patch.status;
    push = { history: { status: patch.status, by: new Types.ObjectId(actorId), at: new Date() } };
  }
  if (patch.assignedTo !== undefined) {
    if (patch.assignedTo === null) unset["assignedTo"] = 1;
    else {
      if (!Types.ObjectId.isValid(patch.assignedTo))
        throw badRequest("Unknown team member.", "assignee_not_found");
      const assignee = await User.findOne(
        { _id: patch.assignedTo, adminRole: { $exists: true }, disabledAt: { $exists: false } },
        { _id: 1 },
      ).lean();
      if (!assignee)
        throw badRequest("That person can't be assigned enquiries.", "assignee_not_found");
      set["assignedTo"] = assignee._id;
    }
  }
  if (patch.archived === true && !row.archivedAt) set["archivedAt"] = new Date();
  if (patch.archived === false && row.archivedAt) unset["archivedAt"] = 1;

  const update = {
    ...(Object.keys(set).length ? { $set: set } : {}),
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
    ...(push ? { $push: push } : {}),
  };
  if (Object.keys(update).length) await Enquiry.updateOne({ _id }, update);
  return getEnquiry(id);
}

export async function addNote(
  actor: { id: string; name: string },
  id: string,
  text: string,
): Promise<EnquiryDetail> {
  await connectDb();
  const result = await Enquiry.updateOne(
    { _id: toId(id) },
    {
      $push: {
        notes: {
          authorId: new Types.ObjectId(actor.id),
          authorName: actor.name,
          text,
          createdAt: new Date(),
        },
      },
    },
  );
  if (result.matchedCount === 0) throw notFound("Enquiry not found", "enquiry_not_found");
  return getEnquiry(id);
}

/** Permanent removal is only possible after archiving: a deliberate two-step. */
export async function deleteEnquiry(id: string): Promise<void> {
  await connectDb();
  const row = await Enquiry.findById(toId(id), { archivedAt: 1 }).lean();
  if (!row) throw notFound("Enquiry not found", "enquiry_not_found");
  if (!row.archivedAt) throw badRequest("Archive the enquiry before deleting it.", "not_archived");
  await Enquiry.deleteOne({ _id: row._id });
}

export async function listAssignees(): Promise<{ id: string; name: string }[]> {
  await connectDb();
  const users = await User.find(
    { adminRole: { $exists: true }, disabledAt: { $exists: false } },
    { firstName: 1, lastName: 1 },
  )
    .sort({ firstName: 1 })
    .lean();
  return users.map((u) => ({ id: String(u._id), name: `${u.firstName} ${u.lastName}` }));
}

export const EXPORT_LIMIT = 5000;

/** CSV of the filtered enquiries, newest first, up to `EXPORT_LIMIT` rows. */
export async function exportEnquiries(
  filter: EnquiryFilter,
  viewerId?: string,
): Promise<{ csv: string; rows: number }> {
  await connectDb();
  const rows = await Enquiry.find(filterOf(filter, viewerId))
    .sort({ createdAt: -1, _id: -1 })
    .limit(EXPORT_LIMIT)
    .lean();
  const names = await adminNames(rows.flatMap((r) => (r.assignedTo ? [r.assignedTo] : [])));
  const wholesale = filter.kind === "wholesale";
  const header = [
    "Reference",
    "Received",
    "Status",
    "Name",
    "Email",
    ...(wholesale ? ["Phone", "Business", "Business type", "Location", "Tax ID"] : ["Topic"]),
    "Message",
    "Assigned to",
    "Notes",
    "Archived",
  ];
  const body = rows.map((r) => [
    r.reference,
    r.createdAt.toISOString(),
    STATUS_LABELS[r.status],
    r.name,
    r.email,
    ...(wholesale ? [r.phone, r.businessName, r.businessType, r.location, r.taxId] : [r.topic]),
    r.message,
    r.assignedTo ? (names.get(String(r.assignedTo)) ?? "") : "",
    r.notes.map((n) => `${n.authorName}: ${n.text}`).join(" | "),
    r.archivedAt ? "yes" : "no",
  ]);
  return { csv: toCsv(header, body), rows: rows.length };
}

export const kindLabel = (kind: EnquiryKind): string => KIND_LABELS[kind].plural;
