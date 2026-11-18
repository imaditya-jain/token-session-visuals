import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("allows same-site relative paths including query strings", () => {
    expect(safeRedirectPath("/account")).toBe("/account");
    expect(safeRedirectPath("/shop?sort=price-asc&type=Pots")).toBe(
      "/shop?sort=price-asc&type=Pots",
    );
  });
  it("falls back for absolute, protocol-relative, backslash and control-character URLs", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil",
      "/a\nb",
      "",
      null,
      undefined,
    ]) {
      expect(safeRedirectPath(bad)).toBe("/account");
    }
    expect(safeRedirectPath("x".repeat(300))).toBe("/account");
    expect(safeRedirectPath("//x", "/shop")).toBe("/shop");
  });
});
