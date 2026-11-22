import { describe, expect, it } from "vitest";

import { navLinks } from "@/data/site";
import { store } from "@/data/store-info";

import {
  chromeDraftSchema,
  chromeSchema,
  DEFAULT_CHROME,
  isPlaceholderUrl,
  navItemSchema,
  normalizeForPublish,
  phoneHref,
  type SiteChrome,
} from "./site-chrome";

const clone = (): SiteChrome => structuredClone(DEFAULT_CHROME);

describe("defaults keep the storefront exactly as it was", () => {
  it("carry the shop's real contact details", () => {
    expect(DEFAULT_CHROME.footer.contact).toEqual({
      address: store.address,
      email: store.email,
      phone: store.phone,
      phoneDial: "+15035550142",
      hours: store.hours,
    });
    const { phone, phoneDial } = DEFAULT_CHROME.footer.contact;
    expect(phoneHref(phone, phoneDial)).toBe(store.phoneHref);
  });

  it("keep the original menu in order, with the journal added", () => {
    const labels = DEFAULT_CHROME.header.nav.map((item) => item.label);
    expect(labels.filter((label) => label !== "Journal")).toEqual(
      navLinks.map((link) => link.label),
    );
    expect(DEFAULT_CHROME.header.nav.find((item) => item.label === "Journal")?.href).toBe("/blog");
    expect(
      DEFAULT_CHROME.footer.columns.find((c) => c.heading === "Company")?.links.map((l) => l.href),
    ).toContain("/blog");
  });

  it("keep the four footer icons the design shows", () => {
    expect(DEFAULT_CHROME.social.map((s) => s.platform)).toEqual([
      "instagram",
      "facebook",
      "twitter",
      "youtube",
    ]);
  });

  it("are valid as a draft, and valid for publishing once placeholder icons are hidden", () => {
    expect(chromeDraftSchema.safeParse(DEFAULT_CHROME).success).toBe(true);
    expect(chromeSchema.safeParse(DEFAULT_CHROME).success).toBe(false);
    const { chrome, hidden } = normalizeForPublish(DEFAULT_CHROME);
    expect(hidden).toEqual(["instagram", "facebook", "twitter", "youtube"]);
    expect(chromeSchema.safeParse(chrome).success).toBe(true);
    expect(chrome.social.every((s) => !s.enabled)).toBe(true);
  });

  it("every default link is a valid link", () => {
    const all = [
      ...DEFAULT_CHROME.header.nav,
      ...DEFAULT_CHROME.footer.columns.flatMap((c) => c.links),
      ...DEFAULT_CHROME.footer.legal,
    ];
    for (const item of all)
      expect(navItemSchema.safeParse({ ...item, children: [] }).success, item.href).toBe(true);
  });
});

describe("links", () => {
  const nav = (href: string) => navItemSchema.safeParse({ label: "x", href });
  it.each([
    "/shop",
    "https://example.com/a?b=1",
    "mailto:hi@example.com",
    "tel:+15035550142",
    "#footer",
  ])("accepts %s", (href) => expect(nav(href).success).toBe(true));
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:1",
    "data:text/html,x",
    "//evil.example",
    "/a b",
    "",
    "vbscript:x",
  ])("refuses %j", (href) => expect(nav(href).success).toBe(false));
  it("limits dropdown size and label length", () => {
    const sub = Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, href: "/x" }));
    expect(navItemSchema.safeParse({ label: "x", href: "/x", children: sub }).success).toBe(false);
    expect(
      nav("/x").success && navItemSchema.safeParse({ label: "x".repeat(41), href: "/x" }).success,
    ).toBe(false);
  });
});

describe("social links", () => {
  const withSocial = (url: string, enabled = true) => {
    const chrome = clone();
    chrome.social = [{ id: "instagram", platform: "instagram", url, enabled }];
    return chrome;
  };
  it("need a full https address when switched on", () => {
    expect(chromeSchema.safeParse(withSocial("https://instagram.com/fernwood")).success).toBe(true);
    for (const bad of [
      "http://instagram.com/x",
      "instagram.com/x",
      "javascript:alert(1)",
      "",
      "#footer",
    ]) {
      expect(chromeSchema.safeParse(withSocial(bad)).success, bad).toBe(false);
    }
  });
  it("may be anything while switched off, and placeholders only pass as drafts", () => {
    expect(chromeSchema.safeParse(withSocial("", false)).success).toBe(true);
    expect(chromeDraftSchema.safeParse(withSocial("#footer")).success).toBe(true);
    expect(chromeDraftSchema.safeParse(withSocial("javascript:alert(1)")).success).toBe(false);
  });
  it("refuses duplicate ids and unknown platforms", () => {
    const dup = clone();
    dup.social = [
      { id: "a", platform: "instagram", url: "https://a.example", enabled: true },
      { id: "a", platform: "facebook", url: "https://b.example", enabled: true },
    ];
    expect(chromeSchema.safeParse(dup).success).toBe(false);
    const unknown = {
      ...clone(),
      social: [{ id: "x", platform: "myspace", url: "https://x.example", enabled: true }],
    };
    expect(chromeSchema.safeParse(unknown).success).toBe(false);
  });
  it("recognises placeholders", () => {
    expect(isPlaceholderUrl("#footer")).toBe(true);
    expect(isPlaceholderUrl("")).toBe(true);
    expect(isPlaceholderUrl("https://x.example")).toBe(false);
  });
});

describe("other fields", () => {
  it("validates the contact email and limits the announcement to four items", () => {
    const bad = clone();
    bad.footer.contact.email = "not an email";
    expect(chromeDraftSchema.safeParse(bad).success).toBe(false);
    const many = clone();
    many.announcement.items = Array.from({ length: 5 }, (_, i) => ({
      text: `t${i}`,
      highlight: "",
      hideOnMobile: false,
    }));
    expect(chromeDraftSchema.safeParse(many).success).toBe(false);
  });
  it("allows the contact fields to be emptied", () => {
    const chrome = clone();
    chrome.footer.contact = { address: "", email: "", phone: "", phoneDial: "", hours: "" };
    expect(chromeDraftSchema.safeParse(chrome).success).toBe(true);
  });
  it("formats tel links from any phone text", () => {
    expect(phoneHref("+91 98765-43210")).toBe("tel:+919876543210");
    expect(phoneHref("(503) 555-0142", "+15035550142")).toBe("tel:+15035550142");
  });
  it("only accepts a sensible dial number", () => {
    const bad = clone();
    bad.footer.contact.phoneDial = "call me";
    expect(chromeDraftSchema.safeParse(bad).success).toBe(false);
  });
});
