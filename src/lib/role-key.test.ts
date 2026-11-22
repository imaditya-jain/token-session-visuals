import { describe, expect, it } from "vitest";

import { roleKeyFromName } from "./role-key";

describe("roleKeyFromName", () => {
  it.each([
    ["SEO Writer", "seo_writer"],
    ["  Blog   Manager!! ", "blog_manager"],
    ["2024 Interns", "r_2024_interns"],
    ["Café Staff", "cafe_staff"],
    ["Ab", "ab"],
  ])("%s → %s", (name, key) => expect(roleKeyFromName(name)).toBe(key));

  it("returns an empty string when nothing usable remains or the result is too short", () => {
    expect(roleKeyFromName("!!!")).toBe("");
    expect(roleKeyFromName("")).toBe("");
    expect(roleKeyFromName("A")).toBe("");
  });

  it("never exceeds 40 characters and always passes the key rules", () => {
    const key = roleKeyFromName("x".repeat(100));
    expect(key.length).toBeLessThanOrEqual(40);
    expect(key).toMatch(/^[a-z][a-z0-9_]{1,39}$/);
  });
});
