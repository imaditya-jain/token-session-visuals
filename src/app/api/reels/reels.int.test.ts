// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { disconnectDb } from "@/server/db/connection";
import { AuditLog } from "@/server/db/models/audit-log";
import { EmailJob } from "@/server/db/models/email-job";
import { OtpChallenge } from "@/server/db/models/otp-challenge";
import { RateLimit } from "@/server/db/models/rate-limit";
import { Reel, ReelComment, ReelLike, ReelReport } from "@/server/db/models/reel";
import { Role } from "@/server/db/models/role";
import { User } from "@/server/db/models/user";
import { registerUser } from "@/server/services/auth";
import { eraseUserReels, sweepAbandonedReels } from "@/server/services/reels";
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
import { DELETE as remove, GET as getOne } from "./[id]/route";
import { GET as mine } from "./mine/route";
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
    expect((await bad({ sizeBytes: 2 * 1024 * 1024 + 1 })).status).toBe(400);
    expect(
      (
        await bad({
          kind: "video",
          contentType: "video/mp4",
          sizeBytes: 5 * 1024 * 1024 + 1,
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
    expect((await bad({ extra: true })).status).toBe(400);
    expect(await Reel.countDocuments()).toBe(0);
    const ok = await bad({
      kind: "video",
      contentType: "video/mp4",
      sizeBytes: 5 * 1024 * 1024,
      durationMs: 30_000,
    });
    expect(ok.status).toBe(201);
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
    storage.objects.set(reel2?.storagePath ?? "", { size: 3 * 1024 * 1024, head: JPEG });
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
  it("keeps a new reel private until a moderator approves it", async () => {
    const author = await member("a@example.com");
    const viewer = await member("b@example.com");
    const admin = await adminSession("boss@example.com", "super_admin");
    const id = await post(author.token);

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

  it("an unapproved reel cannot be liked or commented on by others", async () => {
    const author = await member("a@example.com");
    const fan = await member("b@example.com");
    const id = await post(author.token);
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
    expect(await sweepAbandonedReels()).toBe(1);
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
    expect(reel).toMatchObject({ kind: "video", status: "pending", durationMs: 20_000 });
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
