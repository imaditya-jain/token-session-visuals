import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const catalog = vi.hoisted(() => ({
  getCollections: vi.fn(),
  getProducts: vi.fn(),
}));
vi.mock("@/data/catalog", () => catalog);
const policies = vi.hoisted(() => ({ getPolicy: vi.fn() }));
vi.mock("@/server/services/policies", () => policies);

const blog = vi.hoisted(() => ({
  listLiveSlugs: vi.fn(),
  listPublicCategories: vi.fn(),
  listPublicTags: vi.fn(),
}));
vi.mock("@/server/services/blog-public", () => blog);

import robots from "./robots";
import sitemap from "./sitemap";

beforeEach(() => {
  vi.stubEnv("SITE_URL", "https://fernwood.example/");
  catalog.getCollections.mockResolvedValue([{ slug: "house-plants" }, { slug: "pots-planters" }]);
  catalog.getProducts.mockResolvedValue([{ slug: "monstera-deliciosa" }, { slug: "zz-plant" }]);
  blog.listLiveSlugs.mockResolvedValue([]);
  blog.listPublicCategories.mockResolvedValue([]);
  blog.listPublicTags.mockResolvedValue([]);
  policies.getPolicy.mockImplementation(async (slug: string) =>
    slug === "privacy-policy" ? { title: "Privacy", html: "<p>x</p>" } : null,
  );
});
afterEach(() => vi.unstubAllEnvs());

describe("robots", () => {
  it("allows the public site, hides account/auth/api/search, and points at the sitemap", () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0]! : result.rules;
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(
      expect.arrayContaining([
        "/api/",
        "/account",
        "/login",
        "/register",
        "/search",
        "/reset-password",
        "/admin",
      ]),
    );
    expect(result.sitemap).toBe("https://fernwood.example/sitemap.xml");
  });
});

describe("sitemap and the journal", () => {
  it("leaves the journal out until it has a published post", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/blog"))).toBe(false);
  });

  it("lists the journal, each live post with its modified date, and categories and tags that have posts", async () => {
    const updatedAt = new Date("2030-01-02T03:04:05Z");
    blog.listLiveSlugs.mockResolvedValue([{ slug: "caring-for-ferns", updatedAt }]);
    blog.listPublicCategories.mockResolvedValue([{ slug: "plant-care" }]);
    blog.listPublicTags.mockResolvedValue([{ slug: "low-light" }]);
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        "https://fernwood.example/blog",
        "https://fernwood.example/blog/caring-for-ferns",
        "https://fernwood.example/blog/category/plant-care",
        "https://fernwood.example/blog/tag/low-light",
      ]),
    );
    expect(entries.find((e) => e.url.endsWith("/blog/caring-for-ferns"))?.lastModified).toEqual(
      updatedAt,
    );
  });
});

describe("sitemap", () => {
  it("lists static pages, every collection and product, and only published policies", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        "https://fernwood.example",
        "https://fernwood.example/shop",
        "https://fernwood.example/faq",
        "https://fernwood.example/collections/house-plants",
        "https://fernwood.example/collections/pots-planters",
        "https://fernwood.example/products/monstera-deliciosa",
        "https://fernwood.example/products/zz-plant",
        "https://fernwood.example/policies/privacy-policy",
      ]),
    );
    expect(urls).not.toContain("https://fernwood.example/policies/terms-of-service");
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("never lists account, auth, search or API URLs", async () => {
    const urls = (await sitemap()).map((entry) => entry.url).join("\n");
    for (const hidden of ["/account", "/login", "/register", "/search", "/api/", "/reset-password"])
      expect(urls).not.toContain(hidden);
  });
});
