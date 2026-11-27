// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { disconnectDb } from "@/server/db/connection";
import { AuditLog } from "@/server/db/models/audit-log";
import { EmailJob } from "@/server/db/models/email-job";
import { OtpChallenge } from "@/server/db/models/otp-challenge";
import { RateLimit } from "@/server/db/models/rate-limit";
import {
  Follow,
  Reel,
  ReelComment,
  ReelLike,
  ReelProfile,
  ReelReport,
} from "@/server/db/models/reel";
import { Role } from "@/server/db/models/role";
import { User } from "@/server/db/models/user";
import { registerUser } from "@/server/services/auth";
import { eraseUserReels, sweepReels } from "@/server/services/reels";
import { adminSession, apiRequest } from "@/test/admin-session";
import { startTestDatabase } from "@/test/mongo";

import { GET as adminList } from "../admin/reels/route";
import { PATCH as moderate } from "../admin/reels/[id]/route";
import { DELETE as adminRemoveComment } from "../admin/reels/[id]/comments/[commentId]/route";
import { GET as adminComments } from "../admin/reels/[id]/comments/route";
import { POST as complete } from "./[id]/complete/route";
import { DELETE as removeComment } from "./[id]/comments/[commentId]/route";
import { GET as listComments, POST as addComment } from "./[id]/comments/route";
import { DELETE as unlike, POST as like } from "./[id]/like/route";
import { POST as report } from "./[id]/report/route";
import { DELETE as remove, GET as getOne, PATCH as edit } from "./[id]/route";
import { GET as mine } from "./mine/route";
import { DELETE as unfollowRoute, POST as followRoute } from "../follows/[key]/route";
import { GET as requestsRoute } from "../follows/requests/route";
import { DELETE as declineRoute, POST as approveRoute } from "../follows/requests/[key]/route";
import { GET as authorRoute } from "./authors/[key]/route";
import { GET as privacyGet, PUT as privacyPut } from "./privacy/route";
import { GET as feed, POST as create } from "./route";

const storage = vi.hoisted(() => ({
  configured: true,
  objects: new Map<string, { size: number; head: Uint8Array }>(),
  removed: [] as string[],
}));

vi.mock("@/server/supabase/storage", () => ({
  reelsConfigured: () => storage.configured,
  createSignedUpload: async (path: string) => ({
    uploadUrl: `https://storage.test/upload/${path}?token=t`,
    headers: { "Content-Type": "image/jpeg" },
  }),
  publicUrl: (path: string) => `https://storage.test/public/${path}`,
  probeObject: async (path: string) => storage.objects.get(path) ?? null,
  removeObjects: async (paths: string[]) => {
    storage.removed.push(...paths);
  },
}));

vi.mock("@/data/catalog", () => {
  const product = (slug: string) => ({
    slug,
    name: slug,
    price: 10,
    image: "/x.jpg",
    inStock: true,
  });
  const all = ["monstera", "fern"].map(product);
  return {
    getProduct: async (handle: string) => all.find((p) => p.slug === handle),
    getProducts: async () => all,
  };
});

const VIDEO = {
  aspectRatio: 9 / 16,
  kind: "video",
  contentType: "video/mp4",
  sizeBytes: 4_000_000,
  durationMs: 20_000,
};
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(0)]);
const MP4 = Uint8Array.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, ...new Array(56).fill(0)]);
const HTML = new TextEncoder().encode("<!doctype html><script>alert(1)</script>".padEnd(64, " "));

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
  storage.configured = true;
  storage.objects.clear();
  storage.removed.length = 0;
  await Promise.all(
    [
      User,
      RateLimit,
      EmailJob,
      OtpChallenge,
      Role,
      AuditLog,
      Reel,
      ReelComment,
      ReelLike,
      ReelReport,
      ReelProfile,
      Follow,
    ].map((m) => (m as unknown as { deleteMany: (f: object) => Promise<unknown> }).deleteMany({})),
  );
});

const meta = { ip: "198.51.100.77", userAgent: "vitest" };
async function member(email: string, verified = true) {
  const { accessToken, user } = await registerUser(
    {
      email,
      password: "correct horse battery",
      firstName: "Ada",
      lastName: "Lovelace",
      acceptsMarketing: false,
    },
    meta,
  );
  if (verified) await User.updateOne({ email }, { $set: { emailVerifiedAt: new Date() } });
  return { token: accessToken, id: user.id };
}

const json = async (r: Response) => r.json();
const photo = {
  aspectRatio: 0.8,
  kind: "image",
  contentType: "image/jpeg",
  sizeBytes: 100_000,
  caption: "My balcony",
  topic: "home-planting",
  productHandles: ["monstera"],
};

/** Creates, uploads (fakes the storage) and completes a reel; returns its id. */
async function post(token: string, over: Record<string, unknown> = {}, bytes = JPEG) {
  const res = await create(
    apiRequest("/api/reels", "POST", { token, body: { ...photo, ...over } }),
  );
  expect(res.status).toBe(201);
  const { id } = (await json(res)).data;
  const reel = await Reel.findById(id).lean();
  storage.objects.set(reel?.storagePath ?? "", { size: 120_000, head: bytes });
  const done = await complete(apiRequest(`/api/reels/${id}/complete`, "POST", { token }));
  expect(done.status).toBe(200);
  return id as string;
}

async function approve(adminToken: string, id: string) {
  const res = await moderate(
    apiRequest(`/api/admin/reels/${id}`, "PATCH", {
      token: adminToken,
      body: { status: "approved" },
    }),
  );
  expect(res.status).toBe(200);
}

describe("posting", () => {
  it("needs sign-in and a verified mailbox", async () => {
    expect((await create(apiRequest("/api/reels", "POST", { body: photo }))).status).toBe(401);
    const stranger = await member("new@example.com", false);
    const res = await create(
      apiRequest("/api/reels", "POST", { token: stranger.token, body: photo }),
    );
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe("email_unverified");
  });

  it("enforces 2 MB pictures, 5 MB videos and 30 second videos before anything is stored", async () => {
    const { token } = await member("a@example.com");
    const bad = async (body: object) =>
      create(apiRequest("/api/reels", "POST", { token, body: { ...photo, ...body } }));
    expect((await bad({ sizeBytes: 20 * 1024 * 1024 + 1 })).status).toBe(400);
    expect(
      (
        await bad({
          kind: "video",
          contentType: "video/mp4",
          sizeBytes: 20 * 1024 * 1024 + 1,
          durationMs: 10_000,
        })
      ).status,
    ).toBe(400);
    expect(
      (await bad({ kind: "video", contentType: "video/mp4", sizeBytes: 1000, durationMs: 30_001 }))
        .status,
    ).toBe(400);
    expect((await bad({ kind: "video", contentType: "video/mp4", sizeBytes: 1000 })).status).toBe(
      400,
    );
    expect((await bad({ contentType: "image/svg+xml" })).status).toBe(400);
    expect((await bad({ topic: "cooking" })).status).toBe(400);
    expect((await bad({ productHandles: ["a", "b", "c", "d", "e"] })).status).toBe(400);
    expect((await bad({ caption: "bad\u0000text" })).status).toBe(400);
    for (const aspectRatio of [0.3, 2.5, 0, -1])
      expect((await bad({ aspectRatio })).status, String(aspectRatio)).toBe(400);
    expect((await bad({ aspectRatio: undefined })).status).toBe(400);
    expect((await bad({ extra: true })).status).toBe(400);
    expect(await Reel.countDocuments()).toBe(0);
    for (const aspectRatio of [1, 0.8, 7 / 11, 9 / 16, 16 / 9])
      expect((await bad({ aspectRatio })).status, String(aspectRatio)).toBe(201);
    const ok = await bad({
      kind: "video",
      contentType: "video/mp4",
      sizeBytes: 20 * 1024 * 1024,
      durationMs: 30_000,
    });
    expect(ok.status).toBe(201);
  });

  it("accepts what real phones send: a fractional length, a true 16:9 and a 20 MB file", async () => {
    const { token } = await member("a@example.com");
    const go = (body: object) =>
      create(apiRequest("/api/reels", "POST", { token, body: { ...photo, ...body } }));
    const video = { kind: "video", contentType: "video/mp4" };
    expect(
      (await go({ ...video, sizeBytes: 3_000_000, durationMs: 3041.6, aspectRatio: 9 / 16 }))
        .status,
    ).toBe(201);
    expect(
      (
        await go({
          ...video,
          sizeBytes: 20 * 1024 * 1024,
          durationMs: 29_999.9,
          aspectRatio: 1920 / 1080,
        })
      ).status,
    ).toBe(201);
    expect((await go({ sizeBytes: 12 * 1024 * 1024, aspectRatio: 4 / 9 })).status).toBe(201);
    const stored = await Reel.findOne({ kind: "video" }).sort({ _id: 1 }).lean();
    expect(Number.isInteger(stored?.durationMs)).toBe(true);
  });

  it("refuses unknown linked products and blocks cross-site requests", async () => {
    const { token } = await member("a@example.com");
    const res = await create(
      apiRequest("/api/reels", "POST", { token, body: { ...photo, productHandles: ["nope"] } }),
    );
    expect(res.status).toBe(404);
    const csrf = await create(
      apiRequest("/api/reels", "POST", { token, body: photo, origin: "https://evil.example" }),
    );
    expect(csrf.status).toBe(403);
  });

  it("limits how many reels one person can start per day", async () => {
    const { token } = await member("a@example.com");
    for (let i = 0; i < 10; i += 1) {
      expect((await create(apiRequest("/api/reels", "POST", { token, body: photo }))).status).toBe(
        201,
      );
    }
    const res = await create(apiRequest("/api/reels", "POST", { token, body: photo }));
    expect(res.status).toBe(429);
  });

  it("deletes a file whose real type or size is not what was declared", async () => {
    const { token } = await member("a@example.com");
    const res = await create(apiRequest("/api/reels", "POST", { token, body: photo }));
    const { id } = (await json(res)).data;
    const reel = await Reel.findById(id).lean();
    storage.objects.set(reel?.storagePath ?? "", { size: 500, head: HTML });
    const done = await complete(apiRequest(`/api/reels/${id}/complete`, "POST", { token }));
    expect(done.status).toBe(422);
    expect(storage.removed).toContain(reel?.storagePath);
    expect(await Reel.countDocuments()).toBe(0);

    const second = await create(apiRequest("/api/reels", "POST", { token, body: photo }));
    const id2 = (await json(second)).data.id;
    const reel2 = await Reel.findById(id2).lean();
    storage.objects.set(reel2?.storagePath ?? "", { size: 21 * 1024 * 1024, head: JPEG });
    expect(
      (await complete(apiRequest(`/api/reels/${id2}/complete`, "POST", { token }))).status,
    ).toBe(422);
  });

  it("asks the client to retry when the file has not arrived", async () => {
    const { token } = await member("a@example.com");
    const { id } = (
      await json(await create(apiRequest("/api/reels", "POST", { token, body: photo })))
    ).data;
    const res = await complete(apiRequest(`/api/reels/${id}/complete`, "POST", { token }));
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe("upload_missing");
  });

  it("only the author can complete a reel", async () => {
    const a = await member("a@example.com");
    const b = await member("b@example.com");
    const { id } = (
      await json(await create(apiRequest("/api/reels", "POST", { token: a.token, body: photo })))
    ).data;
    expect(
      (await complete(apiRequest(`/api/reels/${id}/complete`, "POST", { token: b.token }))).status,
    ).toBe(404);
  });

  it("reports itself switched off without storage settings", async () => {
    storage.configured = false;
    const { token } = await member("a@example.com");
    const res = await feed(apiRequest("/api/reels", "GET", { token }));
    expect(res.status).toBe(503);
    expect((await json(res)).error.code).toBe("reels_not_configured");
  });
});

describe("approval and the feed", () => {
  it("publishes straight away, with no review; a reel held after reports is private until an admin restores it", async () => {
    const author = await member("a@example.com");
    const viewer = await member("b@example.com");
    const admin = await adminSession("boss@example.com", "super_admin");
    const id = await post(author.token);

    // Live the moment its file passed the checks.
    expect((await Reel.findById(id).lean())?.status).toBe("approved");
    const live = await json(await feed(apiRequest("/api/reels", "GET", { token: viewer.token })));
    expect(live.data.reels.map((r: { id: string }) => r.id)).toEqual([id]);
    expect((await getOne(apiRequest(`/api/reels/${id}`, "GET"))).status).toBe(200);

    // Held (for example after reports): hidden from everyone but its author, and listed for an admin.
    await Reel.updateOne({ _id: id }, { $set: { status: "pending" } });
    const before = await json(await feed(apiRequest("/api/reels", "GET", { token: viewer.token })));
    expect(before.data.reels).toHaveLength(0);
    expect(
      (await getOne(apiRequest(`/api/reels/${id}`, "GET", { token: viewer.token }))).status,
    ).toBe(404);
    expect(
      (await getOne(apiRequest(`/api/reels/${id}`, "GET", { token: author.token }))).status,
    ).toBe(200);
    const ownList = await json(
      await mine(apiRequest("/api/reels/mine", "GET", { token: author.token })),
    );
    expect(ownList.data.reels[0].status).toBe("pending");
    const queue = await json(
      await adminList(apiRequest("/api/admin/reels?status=pending", "GET", { token: admin.token })),
    );
    expect(queue.data.reels).toHaveLength(1);
    expect(queue.data.counts.pending).toBe(1);
    await approve(admin.token, id);

    const after = await json(await feed(apiRequest("/api/reels", "GET", { token: viewer.token })));
    expect(after.data.reels).toHaveLength(1);
    const reel = after.data.reels[0];
    expect(reel).toMatchObject({
      author: "Ada L.",
      mine: false,
      liked: false,
      topic: "home-planting",
    });
    expect(reel.products).toEqual([expect.objectContaining({ handle: "monstera", inStock: true })]);
    expect(JSON.stringify(reel)).not.toMatch(/storagePath|userId|@example/);
  });

  it("pages newest first and filters by topic", async () => {
    const author = await member("a@example.com");
    const coauthor = await member("a2@example.com");
    const admin = await adminSession("boss@example.com", "super_admin");
    const ids: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      // Two authors, because one person may start at most 10 reels a day.
      const id = await post((i < 6 ? author : coauthor).token, {
        topic: i % 2 === 0 ? "gardening" : "landscaping",
      });
      await approve(admin.token, id);
      ids.push(id);
    }
    const first = await json(await feed(apiRequest("/api/reels", "GET", { token: author.token })));
    expect(first.data.reels.map((r: { id: string }) => r.id)).toEqual(ids.slice(2).reverse());
    expect(first.data.nextCursor).toBeTruthy();
    const second = await json(
      await feed(
        apiRequest(`/api/reels?cursor=${first.data.nextCursor}`, "GET", { token: author.token }),
      ),
    );
    expect(second.data.reels).toHaveLength(2);
    expect(second.data.nextCursor).toBeNull();
    const topic = await json(
      await feed(apiRequest("/api/reels?topic=gardening", "GET", { token: author.token })),
    );
    expect(topic.data.reels.every((r: { topic: string }) => r.topic === "gardening")).toBe(true);
    expect(
      (await feed(apiRequest("/api/reels?cursor=zzz", "GET", { token: author.token }))).status,
    ).toBe(400);
  });

  it("only admins with the permission can moderate", async () => {
    const author = await member("a@example.com");
    const editor = await adminSession("ed@example.com", "editor");
    const id = await post(author.token);
    expect(
      (
        await moderate(
          apiRequest(`/api/admin/reels/${id}`, "PATCH", {
            token: author.token,
            body: { status: "approved" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await moderate(
          apiRequest(`/api/admin/reels/${id}`, "PATCH", {
            token: editor.token,
            body: { status: "approved" },
          }),
        )
      ).status,
    ).toBe(403);
    expect((await adminList(apiRequest("/api/admin/reels", "GET"))).status).toBe(401);
    expect(await AuditLog.countDocuments({ action: /^reel\./ })).toBe(0);
  });

  it("a rejected or removed reel disappears and the decision is audited", async () => {
    const author = await member("a@example.com");
    const admin = await adminSession("boss@example.com", "super_admin");
    const id = await post(author.token);
    await approve(admin.token, id);
    const res = await moderate(
      apiRequest(`/api/admin/reels/${id}`, "PATCH", {
        token: admin.token,
        body: { status: "removed" },
      }),
    );
    expect(res.status).toBe(200);
    const list = await json(await feed(apiRequest("/api/reels", "GET", { token: author.token })));
    expect(list.data.reels).toHaveLength(0);
    expect(await AuditLog.countDocuments({ action: "reel.removed" })).toBe(1);
  });
});

describe("public viewing and the 24 hour life", () => {
  async function live() {
    const author = await member("a@example.com");
    const admin = await adminSession("boss@example.com", "super_admin");
    const id = await post(author.token, VIDEO, MP4);
    await approve(admin.token, id);
    return { author, admin, id };
  }

  it("anyone can watch without signing in, but not like, comment or report", async () => {
    const { id } = await live();
    const list = await json(await feed(apiRequest("/api/reels", "GET")));
    expect(list.data.reels).toHaveLength(1);
    expect(list.data.reels[0]).toMatchObject({ mine: false, liked: false });
    expect((await getOne(apiRequest(`/api/reels/${id}`, "GET"))).status).toBe(200);
    expect((await listComments(apiRequest(`/api/reels/${id}/comments`, "GET"))).status).toBe(200);
    expect((await like(apiRequest(`/api/reels/${id}/like`, "POST"))).status).toBe(401);
    expect(
      (await addComment(apiRequest(`/api/reels/${id}/comments`, "POST", { body: { text: "hi" } })))
        .status,
    ).toBe(401);
    expect((await mine(apiRequest("/api/reels/mine", "GET"))).status).toBe(401);
  });

  it("a stale token is still refused rather than treated as a guest", async () => {
    expect((await feed(apiRequest("/api/reels", "GET", { token: "nope" }))).status).toBe(401);
  });

  it("starts the 24 hour clock at approval and never extends it", async () => {
    const { admin, id } = await live();
    const first = (await Reel.findById(id).lean())?.expiresAt?.getTime() ?? 0;
    expect(first - Date.now()).toBeGreaterThan(23.9 * 3600_000);
    expect(first - Date.now()).toBeLessThanOrEqual(24 * 3600_000);
    await moderate(
      apiRequest(`/api/admin/reels/${id}`, "PATCH", {
        token: admin.token,
        body: { status: "removed" },
      }),
    );
    await approve(admin.token, id);
    expect((await Reel.findById(id).lean())?.expiresAt?.getTime()).toBe(first);
  });

  it("hides an expired reel at once and the sweep deletes it with its file, likes and comments", async () => {
    const { author, id } = await live();
    const fan = await member("b@example.com");
    await like(apiRequest(`/api/reels/${id}/like`, "POST", { token: fan.token }));
    await addComment(
      apiRequest(`/api/reels/${id}/comments`, "POST", { token: fan.token, body: { text: "nice" } }),
    );
    const path = (await Reel.findById(id).lean())?.storagePath;
    await Reel.updateOne({ _id: id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await json(await feed(apiRequest("/api/reels", "GET")))).data.reels).toHaveLength(0);
    expect((await getOne(apiRequest(`/api/reels/${id}`, "GET"))).status).toBe(404);
    expect(
      (await getOne(apiRequest(`/api/reels/${id}`, "GET", { token: author.token }))).status,
    ).toBe(404);
    expect(
      (await like(apiRequest(`/api/reels/${id}/like`, "POST", { token: fan.token }))).status,
    ).toBe(404);

    expect(await sweepReels()).toBe(1);
    expect(await Reel.countDocuments()).toBe(0);
    expect(await ReelLike.countDocuments()).toBe(0);
    expect(await ReelComment.countDocuments()).toBe(0);
    expect(storage.removed).toContain(path);
  });

  it("clears reels that never went live after a week, but keeps fresh waiting ones", async () => {
    const author = await member("a@example.com");
    const old = await post(author.token);
    const fresh = await post(author.token);
    // Held reels (not live) are what the sweep clears; live ones are left to their own clock.
    await Reel.updateMany({ _id: { $in: [old, fresh] } }, { $set: { status: "pending" } });
    await Reel.updateOne(
      { _id: old },
      { $set: { createdAt: new Date(Date.now() - 8 * 24 * 3600_000) } },
    );
    expect(await sweepReels()).toBe(1);
    expect(await Reel.findById(old)).toBeNull();
    expect(await Reel.findById(fresh)).not.toBeNull();
  });
});

describe("engagement", () => {
  async function livePost() {
    const author = await member("a@example.com");
    const fan = await member("b@example.com");
    const admin = await adminSession("boss@example.com", "super_admin");
    const id = await post(author.token);
    await approve(admin.token, id);
    return { author, fan, admin, id };
  }

  it("likes are idempotent and counted once per person", async () => {
    const { fan, id } = await livePost();
    const req = (m: typeof like) =>
      m(apiRequest(`/api/reels/${id}/like`, "POST", { token: fan.token }));
    expect((await json(await req(like))).data).toEqual({ liked: true, likes: 1 });
    expect((await json(await req(like))).data).toEqual({ liked: true, likes: 1 });
    const res = await unlike(apiRequest(`/api/reels/${id}/like`, "DELETE", { token: fan.token }));
    expect((await json(res)).data).toEqual({ liked: false, likes: 0 });
    const again = await unlike(apiRequest(`/api/reels/${id}/like`, "DELETE", { token: fan.token }));
    expect((await json(again)).data.likes).toBe(0);
  });

  it("comments: add, list, delete by author or reel owner, never by others", async () => {
    const { author, fan, id } = await livePost();
    const other = await member("c@example.com");
    const add = await addComment(
      apiRequest(`/api/reels/${id}/comments`, "POST", {
        token: fan.token,
        body: { text: "Lovely monstera!" },
      }),
    );
    expect(add.status).toBe(201);
    const comment = (await json(add)).data.comment;
    expect(comment).toMatchObject({ text: "Lovely monstera!", author: "Ada L.", mine: true });
    const listed = await json(
      await listComments(apiRequest(`/api/reels/${id}/comments`, "GET", { token: author.token })),
    );
    expect(listed.data.comments).toHaveLength(1);
    expect(listed.data.comments[0].mine).toBe(false);
    expect((await Reel.findById(id).lean())?.commentCount).toBe(1);

    const del = (token: string) =>
      removeComment(apiRequest(`/api/reels/${id}/comments/${comment.id}`, "DELETE", { token }));
    expect((await del(other.token)).status).toBe(404);
    expect((await del(author.token)).status).toBe(204);
    expect((await Reel.findById(id).lean())?.commentCount).toBe(0);
    expect((await del(fan.token)).status).toBe(404);
  });

  it("rejects empty, oversize and control-character comments, and unverified commenters", async () => {
    const { fan, id } = await livePost();
    const unverified = await member("u@example.com", false);
    const send = (token: string, text: string) =>
      addComment(apiRequest(`/api/reels/${id}/comments`, "POST", { token, body: { text } }));
    expect((await send(fan.token, "   ")).status).toBe(400);
    expect((await send(fan.token, "x".repeat(301))).status).toBe(400);
    expect((await send(fan.token, "a\u0007b")).status).toBe(400);
    expect((await send(unverified.token, "hi")).status).toBe(403);
  });

  it("stores comment text as plain text (markup is data, not code)", async () => {
    const { fan, id } = await livePost();
    const res = await addComment(
      apiRequest(`/api/reels/${id}/comments`, "POST", {
        token: fan.token,
        body: { text: "<img src=x onerror=alert(1)>" },
      }),
    );
    expect((await json(res)).data.comment.text).toBe("<img src=x onerror=alert(1)>");
  });

  it("three different reporters pull an approved reel back for review; repeats do nothing", async () => {
    const { id } = await livePost();
    const people = await Promise.all(["r1", "r2", "r3"].map((n) => member(`${n}@example.com`)));
    const rep = (token: string) =>
      report(apiRequest(`/api/reels/${id}/report`, "POST", { token, body: { reason: "spam" } }));
    await rep(people[0]!.token);
    await rep(people[0]!.token);
    await rep(people[1]!.token);
    expect((await Reel.findById(id).lean())?.status).toBe("approved");
    expect((await rep(people[2]!.token)).status).toBe(204);
    const reel = await Reel.findById(id).lean();
    expect(reel?.status).toBe("pending");
    expect(reel?.reportCount).toBe(3);
  });

  it("an admin can read and remove comments", async () => {
    const { fan, admin, id } = await livePost();
    const add = await addComment(
      apiRequest(`/api/reels/${id}/comments`, "POST", { token: fan.token, body: { text: "rude" } }),
    );
    const commentId = (await json(add)).data.comment.id;
    const list = await json(
      await adminComments(
        apiRequest(`/api/admin/reels/${id}/comments`, "GET", { token: admin.token }),
      ),
    );
    expect(list.data.comments).toHaveLength(1);
    const del = await adminRemoveComment(
      apiRequest(`/api/admin/reels/${id}/comments/${commentId}`, "DELETE", { token: admin.token }),
    );
    expect(del.status).toBe(204);
    expect((await Reel.findById(id).lean())?.commentCount).toBe(0);
  });

  it("a held reel cannot be liked or commented on by others", async () => {
    const author = await member("a@example.com");
    const fan = await member("b@example.com");
    const id = await post(author.token);
    await Reel.updateOne({ _id: id }, { $set: { status: "pending" } });
    expect(
      (await like(apiRequest(`/api/reels/${id}/like`, "POST", { token: fan.token }))).status,
    ).toBe(404);
    expect(
      (
        await addComment(
          apiRequest(`/api/reels/${id}/comments`, "POST", {
            token: fan.token,
            body: { text: "hi" },
          }),
        )
      ).status,
    ).toBe(404);
  });

  it("malformed ids are a plain 404, never a server error", async () => {
    const { token } = await member("a@example.com");
    expect((await getOne(apiRequest("/api/reels/not-an-id", "GET", { token }))).status).toBe(404);
    expect((await like(apiRequest("/api/reels/%24ne/like", "POST", { token }))).status).toBe(404);
  });
});

describe("removal and housekeeping", () => {
  it("the author can delete their reel with its file, likes and comments", async () => {
    const author = await member("a@example.com");
    const admin = await adminSession("boss@example.com", "super_admin");
    const id = await post(author.token);
    await approve(admin.token, id);
    await like(apiRequest(`/api/reels/${id}/like`, "POST", { token: author.token }));
    const path = (await Reel.findById(id).lean())?.storagePath;
    const other = await member("b@example.com");
    expect(
      (await remove(apiRequest(`/api/reels/${id}`, "DELETE", { token: other.token }))).status,
    ).toBe(404);
    expect(
      (await remove(apiRequest(`/api/reels/${id}`, "DELETE", { token: author.token }))).status,
    ).toBe(204);
    expect(await Reel.countDocuments()).toBe(0);
    expect(await ReelLike.countDocuments()).toBe(0);
    expect(storage.removed).toContain(path);
  });

  it("abandoned uploads are swept with their files", async () => {
    const { token } = await member("a@example.com");
    const { id } = (
      await json(await create(apiRequest("/api/reels", "POST", { token, body: photo })))
    ).data;
    await Reel.updateOne({ _id: id }, { $set: { createdAt: new Date(Date.now() - 2 * 3600_000) } });
    expect(await sweepReels()).toBe(1);
    expect(await Reel.countDocuments()).toBe(0);
    expect(storage.removed).toHaveLength(1);
  });

  it("erasing an account removes its reels and corrects other reels' counters", async () => {
    const leaver = await member("a@example.com");
    const stayer = await member("b@example.com");
    const admin = await adminSession("boss@example.com", "super_admin");
    const mineId = await post(leaver.token);
    const theirs = await post(stayer.token);
    await approve(admin.token, theirs);
    await like(apiRequest(`/api/reels/${theirs}/like`, "POST", { token: leaver.token }));
    await addComment(
      apiRequest(`/api/reels/${theirs}/comments`, "POST", {
        token: leaver.token,
        body: { text: "nice" },
      }),
    );
    await eraseUserReels(leaver.id);
    expect(await Reel.findById(mineId)).toBeNull();
    const kept = await Reel.findById(theirs).lean();
    expect(kept).toMatchObject({ likeCount: 0, commentCount: 0 });
    expect(await ReelLike.countDocuments()).toBe(0);
    expect(await ReelComment.countDocuments()).toBe(0);
  });
});

describe("video reels", () => {
  it("accepts an MP4 within the limits", async () => {
    const { token } = await member("a@example.com");
    const id = await post(
      token,
      { kind: "video", contentType: "video/mp4", sizeBytes: 4_000_000, durationMs: 20_000 },
      MP4,
    );
    const reel = await Reel.findById(id).lean();
    expect(reel).toMatchObject({ kind: "video", status: "approved", durationMs: 20_000 });
  });

  it("refuses a picture file declared as a video", async () => {
    const { token } = await member("a@example.com");
    const res = await create(
      apiRequest("/api/reels", "POST", {
        token,
        body: {
          ...photo,
          kind: "video",
          contentType: "video/mp4",
          sizeBytes: 1000,
          durationMs: 5000,
        },
      }),
    );
    const { id } = (await json(res)).data;
    const reel = await Reel.findById(id).lean();
    storage.objects.set(reel?.storagePath ?? "", { size: 1000, head: JPEG });
    expect(
      (await complete(apiRequest(`/api/reels/${id}/complete`, "POST", { token }))).status,
    ).toBe(422);
  });
});

describe("posts stay, reels expire", () => {
  it("a photo post never expires and the sweep leaves it alone", async () => {
    const author = await member("a@example.com");
    const admin = await adminSession("boss@example.com", "super_admin");
    const id = await post(author.token);
    await approve(admin.token, id);
    const reel = await Reel.findById(id).lean();
    expect(reel?.expiresAt).toBeUndefined();
    await Reel.updateOne(
      { _id: id },
      { $set: { approvedAt: new Date(Date.now() - 30 * 24 * 3600_000) } },
    );
    expect(await sweepReels()).toBe(0);
    const list = await json(await feed(apiRequest("/api/reels", "GET")));
    expect(list.data.reels[0]).toMatchObject({ format: "post", expiresAt: null });
  });

  it("a video is a reel with a 24 hour clock", async () => {
    const author = await member("a@example.com");
    const admin = await adminSession("boss@example.com", "super_admin");
    const id = await post(author.token, VIDEO, MP4);
    await approve(admin.token, id);
    const list = await json(await feed(apiRequest("/api/reels", "GET")));
    expect(list.data.reels[0].format).toBe("reel");
    expect(list.data.reels[0].expiresAt).toBeTruthy();
  });
});

describe("following, privacy and isolation", () => {
  const keyOf = async (token: string) =>
    (await json(await privacyGet(apiRequest("/api/reels/privacy", "GET", { token })))).data
      .key as string;
  const follow = (token: string, key: string) =>
    followRoute(apiRequest(`/api/follows/${key}`, "POST", { token }));
  const setPrivate = (token: string, isPrivate: boolean) =>
    privacyPut(apiRequest("/api/reels/privacy", "PUT", { token, body: { isPrivate } }));

  async function setup() {
    const admin = await adminSession("boss@example.com", "super_admin");
    const ann = await member("ann@example.com");
    const bob = await member("bob@example.com");
    const cat = await member("cat@example.com");
    const annPost = await post(ann.token);
    const bobPost = await post(bob.token);
    await approve(admin.token, annPost);
    await approve(admin.token, bobPost);
    return {
      admin,
      ann,
      bob,
      cat,
      annPost,
      bobPost,
      annKey: await keyOf(ann.token),
      bobKey: await keyOf(bob.token),
    };
  }
  const ids = async (token?: string, query = "") =>
    (
      await json(await feed(apiRequest(`/api/reels${query}`, "GET", token ? { token } : {})))
    ).data.reels.map((r: { id: string }) => r.id) as string[];

  it("people you follow come first, then everyone else, with no repeats across pages", async () => {
    const { ann, bob, cat, annPost, bobPost, bobKey } = await setup();
    expect((await follow(cat.token, bobKey)).status).toBe(200);
    expect(await ids(cat.token)).toEqual([bobPost, annPost]);
    const withState = await json(await feed(apiRequest("/api/reels", "GET", { token: cat.token })));
    expect(withState.data.reels.map((r: { followStatus: string }) => r.followStatus)).toEqual([
      "following",
      "none",
    ]);
    expect(await ids(ann.token)).toEqual([bobPost, annPost]);
    expect(await ids()).toEqual([bobPost, annPost]);
    // Cat now follows the OLDER author: that author's items must jump ahead of newer ones.
    await unfollowRoute(apiRequest(`/api/follows/${bobKey}`, "DELETE", { token: cat.token }));
    await follow(cat.token, await keyOf(ann.token));
    expect(await ids(cat.token)).toEqual([annPost, bobPost]);
    expect(bob.id).toBeTruthy();
  });

  it("pages through followed then other items without duplicates", async () => {
    const { admin, ann, cat, annKey } = await setup();
    await follow(cat.token, annKey);
    const extra: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const author = i % 2 === 0 ? ann : await member(`x${i}@example.com`);
      const id = await post(author.token);
      await approve(admin.token, id);
      extra.push(id);
    }
    const first = await json(await feed(apiRequest("/api/reels", "GET", { token: cat.token })));
    const second = await json(
      await feed(
        apiRequest(`/api/reels?cursor=${first.data.nextCursor}`, "GET", { token: cat.token }),
      ),
    );
    const third = second.data.nextCursor
      ? await json(
          await feed(
            apiRequest(`/api/reels?cursor=${second.data.nextCursor}`, "GET", { token: cat.token }),
          ),
        )
      : { data: { reels: [] } };
    const all = [...first.data.reels, ...second.data.reels, ...third.data.reels].map(
      (r: { id: string }) => r.id,
    );
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(14);
    const followedFirst = [...first.data.reels, ...second.data.reels, ...third.data.reels].map(
      (r: { authorKey: string }) => r.authorKey === annKey,
    );
    expect(followedFirst.indexOf(false)).toBeGreaterThanOrEqual(followedFirst.lastIndexOf(true));
  });

  it("a private account is invisible to strangers and guests until it accepts them", async () => {
    const { ann, bob, cat, annPost, bobPost, annKey } = await setup();
    expect((await setPrivate(ann.token, true)).status).toBe(200);

    for (const viewer of [undefined, bob.token]) {
      expect(await ids(viewer)).not.toContain(annPost);
      const one = await getOne(
        apiRequest(`/api/reels/${annPost}`, "GET", viewer ? { token: viewer } : {}),
      );
      expect(one.status).toBe(404);
      const comments = await listComments(
        apiRequest(`/api/reels/${annPost}/comments`, "GET", viewer ? { token: viewer } : {}),
      );
      expect(comments.status).toBe(404);
      const profile = await json(
        await authorRoute(
          apiRequest(`/api/reels/authors/${annKey}`, "GET", viewer ? { token: viewer } : {}),
        ),
      );
      expect(profile.data.profile).toMatchObject({ isPrivate: true, canView: false, items: 0 });
      expect(profile.data.reels).toEqual([]);
    }
    expect(
      (await like(apiRequest(`/api/reels/${annPost}/like`, "POST", { token: bob.token }))).status,
    ).toBe(404);

    const asked = await json(await follow(bob.token, annKey));
    expect(asked.data.status).toBe("requested");
    expect(await ids(bob.token)).not.toContain(annPost);

    const pending = await json(
      await requestsRoute(apiRequest("/api/follows/requests", "GET", { token: ann.token })),
    );
    expect(pending.data.requests).toHaveLength(1);
    expect(
      (
        await approveRoute(
          apiRequest(`/api/follows/requests/${pending.data.requests[0].key}`, "POST", {
            token: ann.token,
          }),
        )
      ).status,
    ).toBe(204);

    expect(await ids(bob.token)).toContain(annPost);
    expect(
      (await getOne(apiRequest(`/api/reels/${annPost}`, "GET", { token: bob.token }))).status,
    ).toBe(200);
    expect(await ids(cat.token)).not.toContain(annPost);
    expect(await ids(cat.token)).toContain(bobPost);
  });

  it("declining or unfollowing removes access, and going public accepts the waiting requests", async () => {
    const { ann, bob, cat, annPost, annKey } = await setup();
    await setPrivate(ann.token, true);
    await follow(bob.token, annKey);
    await follow(cat.token, annKey);
    const pending = (
      await json(
        await requestsRoute(apiRequest("/api/follows/requests", "GET", { token: ann.token })),
      )
    ).data.requests;
    expect(pending).toHaveLength(2);
    const bobKey = await keyOf(bob.token);
    expect(
      (
        await declineRoute(
          apiRequest(`/api/follows/requests/${bobKey}`, "DELETE", { token: ann.token }),
        )
      ).status,
    ).toBe(204);
    expect(await ids(bob.token)).not.toContain(annPost);
    await setPrivate(ann.token, false);
    expect(await ids(cat.token)).toContain(annPost);
    expect(await ids(bob.token)).toContain(annPost);
    await unfollowRoute(apiRequest(`/api/follows/${annKey}`, "DELETE", { token: cat.token }));
    expect(await Follow.countDocuments({ followerId: cat.id })).toBe(0);
  });

  it("accounts cannot touch each other's follows, requests or settings", async () => {
    const { ann, bob, cat, annKey, bobKey } = await setup();
    await setPrivate(ann.token, true);
    await follow(bob.token, annKey);
    const bobAsksAnn = (
      await json(
        await requestsRoute(apiRequest("/api/follows/requests", "GET", { token: ann.token })),
      )
    ).data.requests[0].key;
    // Cat cannot approve a request that was addressed to Ann, and sees none of Ann's requests.
    expect(
      (
        await approveRoute(
          apiRequest(`/api/follows/requests/${bobAsksAnn}`, "POST", { token: cat.token }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await json(
          await requestsRoute(apiRequest("/api/follows/requests", "GET", { token: cat.token })),
        )
      ).data.requests,
    ).toEqual([]);
    // Bob cannot approve himself.
    expect(
      (
        await approveRoute(
          apiRequest(`/api/follows/requests/${bobAsksAnn}`, "POST", { token: bob.token }),
        )
      ).status,
    ).toBe(404);
    expect(await Follow.countDocuments({ status: "accepted" })).toBe(0);
    // Cat's unfollow only removes Cat's own edge.
    await unfollowRoute(apiRequest(`/api/follows/${annKey}`, "DELETE", { token: cat.token }));
    expect(await Follow.countDocuments({ status: "requested" })).toBe(1);
    // Privacy changes only ever apply to the caller.
    await setPrivate(cat.token, true);
    expect((await ReelProfile.findOne({ publicId: bobKey }).lean())?.isPrivate).toBe(false);
    expect((await ReelProfile.findOne({ publicId: annKey }).lean())?.isPrivate).toBe(true);
  });

  it("rejects bad handles, following yourself, strangers and anonymous callers", async () => {
    const { ann, annKey } = await setup();
    expect((await follow(ann.token, annKey)).status).toBe(400);
    expect((await follow(ann.token, "0".repeat(16))).status).toBe(404);
    expect((await follow(ann.token, "not-a-key")).status).toBe(404);
    expect((await followRoute(apiRequest(`/api/follows/${annKey}`, "POST"))).status).toBe(401);
    expect(
      (
        await followRoute(
          apiRequest(`/api/follows/${annKey}`, "POST", {
            token: ann.token,
            origin: "https://evil.example",
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await privacyPut(
          apiRequest("/api/reels/privacy", "PUT", { token: ann.token, body: { isPrivate: "yes" } }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await privacyPut(
          apiRequest("/api/reels/privacy", "PUT", {
            token: ann.token,
            body: { isPrivate: true, userId: "x" },
          }),
        )
      ).status,
    ).toBe(400);
  });

  it("never exposes account ids, emails or follower lists to the public", async () => {
    const { ann, annKey } = await setup();
    const json_ = JSON.stringify(
      await json(await authorRoute(apiRequest(`/api/reels/authors/${annKey}`, "GET"))),
    );
    expect(json_).not.toMatch(new RegExp(`${ann.id}|@example\\.com`));
  });

  it("erasing an account removes its follows and profile", async () => {
    const { ann, bob, annKey, bobKey } = await setup();
    await follow(bob.token, annKey);
    await follow(ann.token, bobKey);
    await eraseUserReels(ann.id);
    expect(await Follow.countDocuments({})).toBe(0);
    expect(await ReelProfile.findOne({ publicId: annKey })).toBeNull();
    expect(await ReelProfile.findOne({ publicId: bobKey })).not.toBeNull();
  });
});

describe("editing your own post", () => {
  const patch = (token: string, id: string, body: unknown) =>
    edit(apiRequest(`/api/reels/${id}`, "PATCH", { token, body }));

  it("the author can change caption, topic and linked products, but nothing else", async () => {
    const ann = await member("ann@example.com");
    const id = await post(ann.token);
    const before = await Reel.findById(id).lean();
    const res = await patch(ann.token, id, {
      caption: "New words",
      topic: "landscaping",
      productHandles: ["fern", "fern", "monstera"],
    });
    expect(res.status).toBe(200);
    const reel = (await json(res)).data.reel;
    expect(reel).toMatchObject({ caption: "New words", topic: "landscaping", status: "approved" });
    expect(reel.products.map((p: { handle: string }) => p.handle).sort()).toEqual([
      "fern",
      "monstera",
    ]);
    const after = await Reel.findById(id).lean();
    expect(after?.storagePath).toBe(before?.storagePath);
    expect(after?.userId).toEqual(before?.userId);
    expect(after?.likeCount).toBe(before?.likeCount);
  });

  it("refuses other people's posts, bad values, unknown products and fields it does not own", async () => {
    const ann = await member("ann@example.com");
    const bob = await member("bob@example.com");
    const id = await post(ann.token);
    expect((await patch(bob.token, id, { caption: "mine now" })).status).toBe(404);
    expect((await Reel.findById(id).lean())?.caption).toBe("My balcony");
    expect((await patch(ann.token, id, {})).status).toBe(400);
    expect((await patch(ann.token, id, { caption: "x".repeat(301) })).status).toBe(400);
    expect((await patch(ann.token, id, { caption: "a\u0000b" })).status).toBe(400);
    expect((await patch(ann.token, id, { topic: "cooking" })).status).toBe(400);
    expect((await patch(ann.token, id, { productHandles: ["nope"] })).status).toBe(404);
    for (const forbidden of [
      { status: "approved" },
      { userId: bob.id },
      { storagePath: "x" },
      { likeCount: 99 },
      { expiresAt: "2099-01-01" },
    ]) {
      expect((await patch(ann.token, id, { caption: "ok", ...forbidden })).status).toBe(400);
    }
    expect(
      (await edit(apiRequest(`/api/reels/${id}`, "PATCH", { body: { caption: "x" } }))).status,
    ).toBe(401);
    expect(
      (
        await edit(
          apiRequest(`/api/reels/${id}`, "PATCH", {
            token: ann.token,
            body: { caption: "x" },
            origin: "https://evil.example",
          }),
        )
      ).status,
    ).toBe(403);
    expect((await patch(ann.token, "not-an-id", { caption: "x" })).status).toBe(404);
  });

  it("a live post stays live after an edit and a removed one cannot be edited", async () => {
    const ann = await member("ann@example.com");
    const admin = await adminSession("boss@example.com", "super_admin");
    const id = await post(ann.token);
    await approve(admin.token, id);
    expect((await patch(ann.token, id, { caption: "Fresh caption" })).status).toBe(200);
    expect((await Reel.findById(id).lean())?.status).toBe("approved");
    await moderate(
      apiRequest(`/api/admin/reels/${id}`, "PATCH", {
        token: admin.token,
        body: { status: "removed" },
      }),
    );
    expect((await patch(ann.token, id, { caption: "again" })).status).toBe(404);
  });
});
