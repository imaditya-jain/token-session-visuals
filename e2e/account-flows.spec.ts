import { expect, test, type Page } from "@playwright/test";

import { latestEmailLink, toLocal } from "./helpers/mailbox";

const password = "correct-horse-battery";
const uniqueEmail = () =>
  `flow+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
const randomIp = () =>
  `198.18.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test.describe("password reset", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  });

  test("forgot → emailed link → new password → old password stops working", async ({
    page,
    baseURL,
  }) => {
    const email = uniqueEmail();
    await register(page, email);
    await signOut(page);

    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

    const link = toLocal(await latestEmailLink("reset-password", email), baseURL!);
    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
    await page.getByLabel("Confirm new password").fill("something-different");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByText("Passwords don't match")).toBeVisible();

    await page.getByLabel("Confirm new password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

    await page.getByRole("link", { name: "Sign in" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText("Incorrect email or password.");

    await page.getByLabel("Password", { exact: true }).fill("a-brand-new-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("a reset link works once; reuse explains how to get a new one", async ({
    page,
    baseURL,
  }) => {
    const email = uniqueEmail();
    await register(page, email);
    await signOut(page);
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    const link = toLocal(await latestEmailLink("reset-password", email), baseURL!);

    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
    await page.getByLabel("Confirm new password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill("yet-another-password");
    await page.getByLabel("Confirm new password").fill("yet-another-password");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.locator('form [role="alert"]')).toContainText("invalid or has expired");
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  });

  test("looks identical for an unknown address (no account enumeration)", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(uniqueEmail());
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  });

  test("a link without a token explains itself", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText("missing its code")).toBeVisible();
  });
});

test.describe("email verification", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  });

  test("an unverified account is nudged, confirms via the emailed link, and the nudge disappears", async ({
    page,
    baseURL,
  }) => {
    const email = uniqueEmail();
    await register(page, email);
    await expect(page.getByRole("heading", { name: "Please confirm your email" })).toBeVisible();

    const link = toLocal(await latestEmailLink("verify-email", email), baseURL!);
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();

    await page.getByRole("link", { name: "Go to my account" }).click();
    await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Please confirm your email" })).toHaveCount(0);
  });

  test("the confirmation link is single use and bad links fail clearly", async ({
    page,
    baseURL,
  }) => {
    const email = uniqueEmail();
    await register(page, email);
    const link = toLocal(await latestEmailLink("verify-email", email), baseURL!);
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();

    await page.goto(link);
    await expect(page.locator('main [role="alert"]')).toContainText("invalid or has expired");

    await page.goto("/verify-email?token=" + "x".repeat(40));
    await expect(page.locator('main [role="alert"]')).toContainText("invalid or has expired");
    await page.goto("/verify-email");
    await expect(page.locator('main [role="alert"]')).toContainText("missing its code");
  });

  test("resend sends a fresh link and invalidates the old one", async ({ page, baseURL }) => {
    const email = uniqueEmail();
    await register(page, email);
    const first = toLocal(await latestEmailLink("verify-email", email), baseURL!);

    await page.getByRole("button", { name: "Resend email" }).click();
    await expect(page.getByText("Sent. Check your inbox.")).toBeVisible();
    await expect
      .poll(async () => toLocal(await latestEmailLink("verify-email", email), baseURL!))
      .not.toBe(first);

    await page.goto(first);
    await expect(page.locator('main [role="alert"]')).toContainText("invalid or has expired");
  });
});

test.describe("mobile navigation", () => {
  test("the menu offers sign in, then my account once signed in", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await register(page, uniqueEmail());
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("link", { name: "My account" })).toBeVisible();
  });
});
