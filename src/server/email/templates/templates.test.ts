// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { renderEmail } from "../mailer";
import { brand } from "./brand";

const url = "https://fernwood.example/reset-password?token=abc123";

describe("email templates", () => {
  const cases = [
    ["verify-email", { firstName: "Ada", url }],
    ["reset-password", { firstName: "Ada", url }],
    ["password-changed", { firstName: "Ada" }],
    ["newsletter-confirm", { url }],
    ["otp-code", { firstName: "Ada", code: "042917", minutes: 10, audience: "admin" }],
    ["admin-invite", { firstName: "Ada", roleName: "Editor", url }],
  ] as const;

  it.each(cases)("%s renders branded HTML with a plain-text twin", async (template, data) => {
    const { subject, html, text } = await renderEmail(template, data);
    expect(subject).toMatch(/Fernwood/);
    expect(html).toContain(brand.forest);
    expect(html).toContain(brand.cream);
    expect(html).toContain("Fernwood");
    expect(html).not.toMatch(/<script|<link|@import|https?:\/\/fonts\./i); // email-safe: no scripts or web fonts
    expect(text.length).toBeGreaterThan(40);
    if ("url" in data) {
      expect(html).toContain(url);
      expect(text).toContain(url);
    }
  });

  it("wholesale-application renders the applicant details as escaped text", async () => {
    const { subject, html } = await renderEmail("wholesale-application", {
      businessName: "Green Corner <b>Café</b>",
      contactName: "Ada",
      email: "ada@example.com",
      phone: "+91 98765 43210",
      businessType: "Florist",
      location: "Pune, India",
      taxId: "",
      message: "Forty plants, monthly.",
    });
    expect(subject).toContain("Wholesale application");
    expect(html).not.toContain("<b>Café</b>");
    expect(html).toContain("Forty plants, monthly.");
  });

  it("rejects data that does not match the template schema", async () => {
    await expect(renderEmail("verify-email", { firstName: "Ada" })).rejects.toThrow();
  });

  it("can dump previews for visual review (EMAIL_PREVIEW_DIR)", async () => {
    const dir = process.env["EMAIL_PREVIEW_DIR"];
    if (!dir) return;
    mkdirSync(dir, { recursive: true });
    for (const [template, data] of cases) {
      writeFileSync(join(dir, `${template}.html`), (await renderEmail(template, data)).html);
    }
  });
});
