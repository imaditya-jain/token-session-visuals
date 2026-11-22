// @vitest-environment node
import type { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CHROME } from "@/lib/site-chrome";
import { disconnectDb } from "@/server/db/connection";
import { AuditLog } from "@/server/db/models/audit-log";
import { EmailJob } from "@/server/db/models/email-job";
import { OtpChallenge } from "@/server/db/models/otp-challenge";
import { RateLimit } from "@/server/db/models/rate-limit";
import { Role } from "@/server/db/models/role";
import { SiteSetting } from "@/server/db/models/site-setting";
import { User } from "@/server/db/models/user";
import { readPublishedChrome } from "@/server/services/site-chrome";
import { adminSession, apiRequest } from "@/test/admin-session";
import { startTestDatabase } from "@/test/mongo";

import { GET as audit } from "./audit/route";
import { POST as discard } from "./site/chrome/discard/route";
import { POST as publish } from "./site/chrome/publish/route";
import { GET as getChrome, PUT as putChrome } from "./site/chrome/route";

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
    [User, RateLimit, EmailJob, OtpChallenge, Role, SiteSetting, AuditLog].map((m) =>
      (m as unknown as { deleteMany: (f: object) => Promise<unknown> }).deleteMany({}),
    ),
  );
});

const json = (r: Response) => r.json();
const edit = (mutate: (c: typeof DEFAULT_CHROME) => void) => {
  const copy = structuredClone(DEFAULT_CHROME);
  mutate(copy);
  return copy;
};
const put = (token: string, body: unknown, over: Record<string, unknown> = {}) =>
  putChrome(apiRequest("/api/admin/site/chrome", "PUT", { token, body, ...over }));

describe("who may edit the site", () => {
  it("refuses anonymous callers on every site endpoint", async () => {
    for (const call of [
      () => getChrome(apiRequest("/api/admin/site/chrome", "GET")),
      () => put("", DEFAULT_CHROME),
      () => publish(apiRequest("/api/admin/site/chrome/publish", "POST")),
      () => discard(apiRequest("/api/admin/site/chrome/discard", "POST")),
    ]) {
      expect((await call()).status).toBe(401);
    }
  });

  it("an editor (no site permissions) is refused", async () => {
    const { token } = await adminSession("ed@example.com", "editor");
    expect((await getChrome(apiRequest("/api/admin/site/chrome", "GET", { token }))).status).toBe(
      403,
    );
    expect((await put(token, DEFAULT_CHROME)).status).toBe(403);
    expect(
      (await publish(apiRequest("/api/admin/site/chrome/publish", "POST", { token }))).status,
    ).toBe(403);
  });

  it("a role with only site:write can draft but not publish", async () => {
    await Role.create({ key: "site_editor", name: "Site editor", permissions: ["site:write"] });
    const { token } = await adminSession("se@example.com", "site_editor");
    expect(
      (
        await put(
          token,
          edit((c) => {
            c.footer.about = "Draft only";
          }),
        )
      ).status,
    ).toBe(200);
    const refused = await publish(apiRequest("/api/admin/site/chrome/publish", "POST", { token }));
    expect(refused.status).toBe(403);
    expect((await json(refused)).error.code).toBe("permission_denied");
    expect((await readPublishedChrome()).footer.about).toBe(DEFAULT_CHROME.footer.about);
  });

  it("mutations need a same-origin request", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    expect((await put(token, DEFAULT_CHROME, { origin: "https://evil.example" })).status).toBe(403);
    expect(
      (
        await publish(
          apiRequest("/api/admin/site/chrome/publish", "POST", {
            token,
            origin: "https://evil.example",
          }),
        )
      ).status,
    ).toBe(403);
  });
});

describe("the draft and publish flow over HTTP", () => {
  it("saves a draft, publishes it, and records both in the audit log", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const saved = await json(
      await put(
        token,
        edit((c) => {
          c.announcement.enabled = false;
          c.header.nav[0] = {
            label: "Plants",
            href: "/shop",
            children: [{ label: "Sale", href: "/collections/sale" }],
          };
          c.social[0] = {
            id: "instagram",
            platform: "instagram",
            url: "https://instagram.com/fernwood",
            enabled: true,
          };
        }),
      ),
    );
    expect(saved.data.hasUnpublished).toBe(true);
    expect((await readPublishedChrome()).announcement.enabled).toBe(true);

    const published = await publish(
      apiRequest("/api/admin/site/chrome/publish", "POST", { token }),
    );
    expect(published.status).toBe(200);
    const body = (await json(published)).data;
    expect(body.hasUnpublished).toBe(false);
    expect(body.hidden).toEqual(["facebook", "twitter", "youtube"]);

    const live = await readPublishedChrome();
    expect(live.announcement.enabled).toBe(false);
    expect(live.header.nav[0]).toEqual({
      label: "Plants",
      href: "/shop",
      children: [{ label: "Sale", href: "/collections/sale" }],
    });
    expect(live.social.filter((s) => s.enabled).map((s) => s.platform)).toEqual(["instagram"]);

    const trail = (
      await json(await audit(apiRequest("/api/admin/audit?limit=50", "GET", { token })))
    ).data.entries.map((e: { action: string }) => e.action);
    expect(trail).toEqual(
      expect.arrayContaining(["site.chrome_draft_saved", "site.chrome_published"]),
    );
  });

  it("discards a draft", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    await put(
      token,
      edit((c) => {
        c.footer.about = "Oops";
      }),
    );
    const res = await discard(apiRequest("/api/admin/site/chrome/discard", "POST", { token }));
    const data = (await json(res)).data;
    expect(data.hasUnpublished).toBe(false);
    expect(data.draft.footer.about).toBe(DEFAULT_CHROME.footer.about);
  });
});

describe("hostile and invalid input", () => {
  it.each([
    [
      "a javascript: menu link",
      (c: typeof DEFAULT_CHROME) => {
        c.header.nav[0] = { label: "x", href: "javascript:alert(1)", children: [] };
      },
    ],
    [
      "a javascript: footer link",
      (c: typeof DEFAULT_CHROME) => {
        c.footer.legal[0] = { label: "x", href: "javascript:alert(1)" };
      },
    ],
    [
      "a javascript: dropdown link",
      (c: typeof DEFAULT_CHROME) => {
        c.header.nav[0] = {
          label: "x",
          href: "/x",
          children: [{ label: "y", href: "data:text/html,x" }],
        };
      },
    ],
    [
      "a protocol-relative link",
      (c: typeof DEFAULT_CHROME) => {
        c.footer.columns[0]!.links[0] = { label: "x", href: "//evil.example" };
      },
    ],
    [
      "an http social profile",
      (c: typeof DEFAULT_CHROME) => {
        c.social[0] = {
          id: "instagram",
          platform: "instagram",
          url: "http://instagram.com/x",
          enabled: true,
        };
      },
    ],
    [
      "a javascript: social profile",
      (c: typeof DEFAULT_CHROME) => {
        c.social[0] = {
          id: "instagram",
          platform: "instagram",
          url: "javascript:alert(1)",
          enabled: true,
        };
      },
    ],
    [
      "a bad contact email",
      (c: typeof DEFAULT_CHROME) => {
        c.footer.contact.email = "nope";
      },
    ],
    [
      "too many menu items",
      (c: typeof DEFAULT_CHROME) => {
        c.header.nav = Array.from({ length: 9 }, (_, i) => ({
          label: `L${i}`,
          href: "/x",
          children: [],
        }));
      },
    ],
    [
      "an empty menu label",
      (c: typeof DEFAULT_CHROME) => {
        c.header.nav[0] = { label: " ", href: "/x", children: [] };
      },
    ],
  ])("refuses %s with a 400 and saves nothing", async (_name, mutate) => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    const response = await put(token, edit(mutate));
    expect(response.status).toBe(400);
    expect((await json(response)).error.code).toBe("validation_error");
    expect(await SiteSetting.countDocuments()).toBe(0);
  });

  it("refuses non-objects and oversized bodies without a server error", async () => {
    const { token } = await adminSession("boss@example.com", "super_admin");
    for (const bad of [null, [], "text", 5, { header: 1 }])
      expect((await put(token, bad)).status).toBe(400);
    const huge = edit((c) => {
      c.footer.about = "x";
    });
    (huge as unknown as Record<string, unknown>)["pad"] = "y".repeat(200_000);
    expect((await put(token, huge)).status).toBe(413);
  });
});
