import { expect, test } from "@playwright/test";

import { latestEmailLink, toLocal } from "./helpers/mailbox";

const randomIp = () =>
  `198.19.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
const uniqueEmail = () =>
  `news+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

test.describe("newsletter", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  });

  test("footer signup validates, asks for confirmation, and the emailed link confirms once", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/");
    const form = page.locator("form", { has: page.getByLabel("Email address") });

    await page.getByLabel("Email address").fill("not-an-email");
    await form.getByRole("button", { name: "Subscribe" }).click();
    await expect(page.locator("#newsletter-error")).toContainText("valid email");
    await expect(page.getByLabel("Email address")).toHaveAttribute("aria-invalid", "true");

    const email = uniqueEmail();
    await page.getByLabel("Email address").fill(email);
    await form.getByRole("button", { name: "Subscribe" }).click();
    await expect(page.getByRole("status")).toContainText("Check");
    await expect(page.getByRole("status")).toContainText(email);

    const link = toLocal(await latestEmailLink("newsletter-confirm", email), baseURL!);
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "You're in!" })).toBeVisible();

    await page.goto(link);
    await expect(page.locator('main [role="alert"]')).toContainText("invalid or has expired");
  });

  test("a confirmation link without a token explains itself", async ({ page }) => {
    await page.goto("/newsletter/confirm");
    await expect(page.locator('main [role="alert"]')).toContainText("missing its code");
  });

  test("unsubscribe waits for an explicit click, and a forged link is refused", async ({
    page,
  }) => {
    const forged = `${Buffer.from("victim@example.com").toString("base64url")}.${"A".repeat(43)}`;
    const calls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/newsletter/unsubscribe")) calls.push(request.method());
    });

    await page.goto(`/unsubscribe?token=${encodeURIComponent(forged)}`);
    await expect(page.getByText("Are you sure")).toBeVisible();
    await page.waitForTimeout(500);
    expect(calls).toEqual([]); // opening the link (e.g. an email scanner) must not unsubscribe anyone

    await page.getByRole("button", { name: "Unsubscribe" }).click();
    await expect(page.locator('main [role="alert"]')).toContainText("invalid");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(calls).toEqual(["POST"]);
  });

  test("unsubscribe without a token is an error state with no button", async ({ page }) => {
    await page.goto("/unsubscribe");
    await expect(page.locator('main [role="alert"]')).toContainText("invalid");
    await expect(page.getByRole("button", { name: "Unsubscribe" })).toHaveCount(0);
  });
});
