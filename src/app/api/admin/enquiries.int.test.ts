// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { disconnectDb } from "@/server/db/connection";
import { AuditLog } from "@/server/db/models/audit-log";
import { EmailJob } from "@/server/db/models/email-job";
import { Enquiry } from "@/server/db/models/enquiry";
import { OtpChallenge } from "@/server/db/models/otp-challenge";
import { RateLimit } from "@/server/db/models/rate-limit";
import { Role } from "@/server/db/models/role";
import { User } from "@/server/db/models/user";
import { recordEnquiry } from "@/server/services/enquiries";
import { adminSession, apiRequest } from "@/test/admin-session";
import { startTestDatabase } from "@/test/mongo";

import { GET as audit } from "./audit/route";
import { GET as assignees } from "./enquiries/assignees/route";
import { GET as exportCsv } from "./enquiries/export/route";
import { POST as addNote } from "./enquiries/[id]/notes/route";
import { DELETE as remove, GET as getOne, PATCH as patch } from "./enquiries/[id]/route";
import { GET as list } from "./enquiries/route";

let server: MongoMemoryServer;
beforeAll(async () => {
  server = await startTestDatabase();
}, 120_000);
afterAll(async () => {
  await disconnectDb();
  await server.stop();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  const { connectDb } = await import("@/server/db/connection");
  await connectDb();
  await Promise.all(
    [User, RateLimit, EmailJob, OtpChallenge, Role, AuditLog, Enquiry].map((m) =>
      (m as unknown as { deleteMany: (f: object) => Promise<unknown> }).deleteMany({}),
    ),
  );
});

const json = (r: Response) => r.json();
const contact = (
  over: Partial<{ name: string; email: string; topic: string; message: string }> = {},
) =>
  recordEnquiry({
    kind: "contact",
    name: "Ada Lovelace",
    email: "ada@example.com",
    topic: "Order or delivery",
    message: "Where is my order? It was due last week.",
    ...over,
  });
const wholesale = (over: Record<string, string> = {}) =>
  recordEnquiry({
    kind: "wholesale",
    name: "Grace Hopper",
    email: "grace@example.com",
    phone: "+91 98765 43210",
    businessName: "Green Corner Café",
    businessType: "Café or restaurant",
    location: "Pune",
    taxId: "27ABCDE1234F1Z5",
    message: "We want 40 plants for a new café and monthly supply.",
    ...over,
  });
const get = (path: string, token: string) => apiRequest(path, "GET", { token });
const send = (path: string, method: string, token: string, body?: unknown) =>
  apiRequest(path, method, { token, ...(body !== undefined ? { body } : {}) });

describe("who may do what", () => {
  it("refuses anonymous callers everywhere", async () => {
    const e = await contact();
    const id = String(e._id);
    for (const call of [
      () => list(apiRequest("/api/admin/enquiries?kind=contact", "GET")),
      () => getOne(apiRequest(`/api/admin/enquiries/${id}`, "GET")),
      () =>
        patch(apiRequest(`/api/admin/enquiries/${id}`, "PATCH", { body: { status: "resolved" } })),
      () =>
        addNote(apiRequest(`/api/admin/enquiries/${id}/notes`, "POST", { body: { text: "x" } })),
      () => remove(apiRequest(`/api/admin/enquiries/${id}`, "DELETE")),
      () => exportCsv(apiRequest("/api/admin/enquiries/export?kind=contact", "GET")),
      () => assignees(apiRequest("/api/admin/enquiries/assignees", "GET")),
    ]) {
      expect((await call()).status).toBe(401);
    }
  });

  it("an editor (no enquiry permissions) is refused", async () => {
    const { token } = await adminSession("ed@example.com", "editor");
    expect((await list(get("/api/admin/enquiries?kind=contact", token))).status).toBe(403);
    expect((await exportCsv(get("/api/admin/enquiries/export?kind=contact", token))).status).toBe(
      403,
    );
  });

  it("each permission opens exactly its own door", async () => {
    const e = await contact();
    const id = String(e._id);
    await Role.create({ key: "reader", name: "Reader", permissions: ["enquiries:read"] });
    await Role.create({
      key: "handler",
      name: "Handler",
      permissions: ["enquiries:read", "enquiries:write"],
    });
    const reader = await adminSession("r@example.com", "reader");
    const handler = await adminSession("h@example.com", "handler");

    expect((await list(get("/api/admin/enquiries?kind=contact", reader.token))).status).toBe(200);
    expect(
      (
        await patch(
          send(`/api/admin/enquiries/${id}`, "PATCH", reader.token, { status: "resolved" }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await addNote(
          send(`/api/admin/enquiries/${id}/notes`, "POST", reader.token, { text: "hi" }),
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await patch(
          send(`/api/admin/enquiries/${id}`, "PATCH", handler.token, { status: "resolved" }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await patch(send(`/api/admin/enquiries/${id}`, "PATCH", handler.token, { archived: true })))
        .status,
    ).toBe(200);
    // Writing is not deleting, and personal data can't leave without the export permission.
    expect((await remove(send(`/api/admin/enquiries/${id}`, "DELETE", handler.token))).status).toBe(
      403,
    );
    expect(
      (await exportCsv(get("/api/admin/enquiries/export?kind=contact", handler.token))).status,
    ).toBe(403);
  });

  it("mutations need a same-origin request", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const e = await contact();
    const evil = apiRequest(`/api/admin/enquiries/${e._id}`, "PATCH", {
      token,
      origin: "https://evil.example",
      body: { status: "resolved" },
    });
    expect((await patch(evil)).status).toBe(403);
  });
});

describe("listing and searching", () => {
  it("lists newest first per kind with status counts, search, filters and paging", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    await contact({ name: "Alpha", email: "a@example.com" });
    await new Promise((r) => setTimeout(r, 5));
    const b = await contact({
      name: "Beta",
      email: "b@example.com",
      message: "Plant care question about my fern",
    });
    await wholesale();
    await patch(send(`/api/admin/enquiries/${b._id}`, "PATCH", token, { status: "in_progress" }));

    const all = (await json(await list(get("/api/admin/enquiries?kind=contact", token)))).data;
    expect(all.items.map((i: { name: string }) => i.name)).toEqual(["Beta", "Alpha"]);
    expect(all.counts).toMatchObject({ all: 2, new: 1, in_progress: 1, resolved: 0 });
    expect(all.items[0]).toMatchObject({ headline: "Order or delivery", status: "in_progress" });

    const wh = (await json(await list(get("/api/admin/enquiries?kind=wholesale", token)))).data;
    expect(wh.items).toHaveLength(1);
    expect(wh.items[0]).toMatchObject({ headline: "Green Corner Café" });
    expect(Object.keys(wh.counts).sort()).toEqual([
      "all",
      "approved",
      "in_review",
      "new",
      "rejected",
    ]);

    const byStatus = (
      await json(await list(get("/api/admin/enquiries?kind=contact&status=new", token)))
    ).data;
    expect(byStatus.items.map((i: { name: string }) => i.name)).toEqual(["Alpha"]);
    const bySearch = (
      await json(await list(get("/api/admin/enquiries?kind=contact&search=fern", token)))
    ).data;
    expect(bySearch.items.map((i: { name: string }) => i.name)).toEqual(["Beta"]);
    expect(
      (
        await json(
          await list(get("/api/admin/enquiries?kind=wholesale&search=green%20corner", token)),
        )
      ).data.total,
    ).toBe(1);
    expect(
      (await json(await list(get("/api/admin/enquiries?kind=contact&page=2&perPage=1", token))))
        .data.items,
    ).toHaveLength(1);
  });

  it("searches literally (regex characters are harmless) and rejects bad filters", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    await contact();
    expect(
      (await json(await list(get("/api/admin/enquiries?kind=contact&search=.*", token)))).data
        .total,
    ).toBe(0);
    expect((await list(get("/api/admin/enquiries?kind=contact&search=(", token))).status).toBe(200);
    expect((await list(get("/api/admin/enquiries?kind=other", token))).status).toBe(400);
    expect(
      (await list(get("/api/admin/enquiries?kind=contact&status=approved", token))).status,
    ).toBe(400);
    expect((await list(get("/api/admin/enquiries", token))).status).toBe(400);
  });

  it("keeps archived items out of the main list and shows them in the archive", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const e = await contact();
    await patch(send(`/api/admin/enquiries/${e._id}`, "PATCH", token, { archived: true }));
    expect(
      (await json(await list(get("/api/admin/enquiries?kind=contact", token)))).data.total,
    ).toBe(0);
    expect(
      (await json(await list(get("/api/admin/enquiries?kind=contact&archived=1", token)))).data
        .total,
    ).toBe(1);
  });
});

describe("working an enquiry", () => {
  it("moves through the statuses of its own kind, recording who and when", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const w = await wholesale();
    const id = String(w._id);
    const approved = await json(
      await patch(send(`/api/admin/enquiries/${id}`, "PATCH", token, { status: "approved" })),
    );
    expect(approved.data.enquiry.status).toBe("approved");
    expect(approved.data.enquiry.history.map((h: { status: string }) => h.status)).toEqual([
      "new",
      "approved",
    ]);
    expect(approved.data.enquiry.history[1].byName).toBe("Ada Admin");

    // A contact status doesn't apply to a wholesale application, and vice versa.
    const wrong = await patch(
      send(`/api/admin/enquiries/${id}`, "PATCH", token, { status: "resolved" }),
    );
    expect(wrong.status).toBe(400);
    expect((await json(wrong)).error.code).toBe("invalid_status");
    const c = await contact();
    expect(
      (await patch(send(`/api/admin/enquiries/${c._id}`, "PATCH", token, { status: "approved" })))
        .status,
    ).toBe(400);
  });

  it("assigns to an active admin only, and unassigns", async () => {
    await Role.create({
      key: "handler",
      name: "Handler",
      permissions: ["enquiries:read", "enquiries:write"],
    });
    const boss = await adminSession("boss@example.com", "super_admin");
    const other = await adminSession("ed@example.com", "handler");
    const e = await contact();
    const url = `/api/admin/enquiries/${e._id}`;

    const ok = await json(
      await patch(send(url, "PATCH", boss.token, { assignedTo: other.userId })),
    );
    expect(ok.data.enquiry).toMatchObject({
      assignedTo: other.userId,
      assignedToName: "Ada Admin",
    });
    expect(
      (
        await json(
          await list(get("/api/admin/enquiries?kind=contact&assignee=" + other.userId, boss.token)),
        )
      ).data.total,
    ).toBe(1);
    expect(
      (
        await json(
          await list(get("/api/admin/enquiries?kind=contact&assignee=unassigned", boss.token)),
        )
      ).data.total,
    ).toBe(0);
    expect(
      (await json(await list(get("/api/admin/enquiries?kind=contact&assignee=me", other.token))))
        .data.total,
    ).toBe(1);

    const customer = await User.create({
      email: "c@example.com",
      firstName: "C",
      lastName: "C",
      passwordHash: "x",
    });
    for (const bad of [String(customer._id), new Types.ObjectId().toString(), "nope"]) {
      const res = await patch(send(url, "PATCH", boss.token, { assignedTo: bad }));
      expect(res.status).toBe(400);
      expect((await json(res)).error.code).toBe("assignee_not_found");
    }
    await User.updateOne({ _id: other.userId }, { $set: { disabledAt: new Date() } });
    expect((await patch(send(url, "PATCH", boss.token, { assignedTo: other.userId }))).status).toBe(
      400,
    );

    const cleared = await json(await patch(send(url, "PATCH", boss.token, { assignedTo: null })));
    expect(cleared.data.enquiry.assignedTo).toBeNull();
    const names = (await json(await assignees(get("/api/admin/enquiries/assignees", boss.token))))
      .data.assignees;
    expect(names.map((n: { id: string }) => n.id)).toEqual([boss.userId]);
  });

  it("adds notes with the author's name, stores markup as text, and keeps note text out of the audit log", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const e = await contact();
    const url = `/api/admin/enquiries/${e._id}/notes`;
    const res = await addNote(
      send(url, "POST", token, { text: "Called her. <script>alert(1)</script> secret-note-text" }),
    );
    expect(res.status).toBe(201);
    const note = (await json(res)).data.enquiry.notes[0];
    expect(note.authorName).toBe("Ada Admin");
    expect(note.text).toContain("<script>");
    expect(
      Object.keys(
        (await json(await getOne(get(`/api/admin/enquiries/${e._id}`, token)))).data.enquiry.notes,
      ),
    ).toHaveLength(1);

    expect((await addNote(send(url, "POST", token, { text: "   " }))).status).toBe(400);
    expect((await addNote(send(url, "POST", token, { text: "x".repeat(2001) }))).status).toBe(400);
    const trail = JSON.stringify(await json(await audit(get("/api/admin/audit?limit=50", token))));
    expect(trail).toContain("enquiry.note_added");
    expect(trail).not.toContain("secret-note-text");
  });

  it("deletes only after archiving", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const e = await contact();
    const url = `/api/admin/enquiries/${e._id}`;
    const early = await remove(send(url, "DELETE", token));
    expect(early.status).toBe(400);
    expect((await json(early)).error.code).toBe("not_archived");
    await patch(send(url, "PATCH", token, { archived: true }));
    expect((await remove(send(url, "DELETE", token))).status).toBe(200);
    expect(await Enquiry.countDocuments()).toBe(0);
    expect((await getOne(get(url, token))).status).toBe(404);
  });

  it("answers 404 for unknown ids and 400 for empty updates", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    for (const id of ["nope", new Types.ObjectId().toString()]) {
      expect((await getOne(get(`/api/admin/enquiries/${id}`, token))).status).toBe(404);
      expect(
        (await patch(send(`/api/admin/enquiries/${id}`, "PATCH", token, { status: "resolved" })))
          .status,
      ).toBe(404);
    }
    const e = await contact();
    expect((await patch(send(`/api/admin/enquiries/${e._id}`, "PATCH", token, {}))).status).toBe(
      400,
    );
  });
});

describe("CSV export", () => {
  it("downloads the filtered rows with a safe filename, and neutralises spreadsheet formulas", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    await contact({
      name: '=HYPERLINK("http://evil")',
      message: '+1+1 trick, with comma and "quotes"',
    });
    await contact({ name: "Beta", email: "b@example.com" });
    await wholesale();

    const res = await exportCsv(get("/api/admin/enquiries/export?kind=contact", token));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="fernwood-contact-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    // A UTF-8 byte-order mark first, so Excel reads accents and symbols correctly.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text.startsWith("\uFEFFReference,Received,Status,Name,Email,Topic,Message")).toBe(true);
    expect(text).toContain("'=HYPERLINK");
    expect(text).toContain('"\'+1+1 trick, with comma and ""quotes"""');
    expect(text.split("\r\n").filter(Boolean)).toHaveLength(3);
    expect(text).not.toContain("Green Corner");

    const wh = await (
      await exportCsv(get("/api/admin/enquiries/export?kind=wholesale&status=new", token))
    ).text();
    expect(wh).toContain("Business,Business type,Location,Tax ID");
    expect(wh).toContain("Green Corner Café");
    const trail = JSON.stringify(await json(await audit(get("/api/admin/audit?limit=50", token))));
    expect(trail).toContain("enquiry.exported");
  });

  it("filters by date and rejects malformed ones", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    await contact();
    const past = await (
      await exportCsv(
        get("/api/admin/enquiries/export?kind=contact&from=2001-01-01&to=2001-01-31", token),
      )
    ).text();
    expect(past.split("\r\n").filter(Boolean)).toHaveLength(1);
    expect(
      (await exportCsv(get("/api/admin/enquiries/export?kind=contact&from=yesterday", token)))
        .status,
    ).toBe(400);
  });
});
