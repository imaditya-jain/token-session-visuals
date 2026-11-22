import { expect, test, type Page } from "@playwright/test";

import { latestOtpCode, submitLoginAndEnterCode } from "./helpers/mailbox";

const password = "correct-horse-battery";
const uniqueEmail = () =>
  `shopper+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function register(page: Page, email = uniqueEmail()) {
  await page.goto("/register");
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  return email;
}

/** Each test is a distinct "visitor": the edge proxy sets X-Forwarded-For, which the rate limiter keys on. */
const randomIp = () => `203.0.113.${1 + Math.floor(Math.random() * 250)}`;

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
}

test.describe("authentication", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  });

  test("registers, lands on the account page and survives a reload via the refresh cookie", async ({
    page,
  }) => {
    const email = await register(page);
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: "My account" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("First name")).toHaveValue("Ada");
    await expect(page).toHaveURL(/\/account$/);
  });

  test("never exposes the refresh token to JavaScript; only a non-sensitive hint cookie is readable", async ({
    page,
  }) => {
    await register(page);
    await expect(page).toHaveURL(/\/account$/);
    const readable = await page.evaluate(() => document.cookie);
    expect(readable).toContain("fw_auth=1");
    expect(readable).not.toMatch(/fw_rt/);
    expect(
      await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage)),
    ).not.toMatch(/token/i);

    const cookies = await page.context().cookies();
    const refresh = cookies.find((c) => c.name.endsWith("fw_rt"));
    expect(refresh).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/api/auth" });
  });

  test("anonymous visitors never call the session endpoints (no hint cookie, no request)", async ({
    page,
  }) => {
    const calls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/")) calls.push(request.url());
    });
    await page.goto("/");
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    expect(calls).toEqual([]);
  });

  test("protects the account page and sends people back after signing in", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await expect(page).toHaveURL(/\/account$/);
    await signOut(page);

    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?next=(%2F|\/)account$/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await submitLoginAndEnterCode(page, email);
    await expect(page).toHaveURL(/\/account$/);
  });

  test("ignores off-site redirect targets after login", async ({ page }) => {
    const email = uniqueEmail();
    await register(page, email);
    await signOut(page);

    await page.goto("/login?next=https%3A%2F%2Fevil.example%2Fsteal");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await submitLoginAndEnterCode(page, email);
    await expect(page).toHaveURL(/\/account$/);
  });

  test("shows client-side validation and keeps the user on the form", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("Use at least 10 characters")).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  });

  test("rejects a duplicate email with a field-level message", async ({ page }) => {
    const email = await register(page);
    await expect(page).toHaveURL(/\/account$/);
    await signOut(page);
    await register(page, email);
    await expect(page.getByText("An account with this email already exists.")).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("wrong credentials show one generic message", async ({ page }) => {
    const email = await register(page);
    await signOut(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText("Incorrect email or password.");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("after the password, a code screen appears; a wrong code is refused, the right one signs in", async ({
    page,
  }) => {
    const email = await register(page);
    await signOut(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    const since = new Date(Date.now() - 1000);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await expect(page.getByRole("status")).toContainText(email.toLowerCase());
    await expect(page.getByRole("status")).toContainText("expires in 10 minutes");
    await expect(page.getByLabel("Verification code")).toBeFocused();
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/login$/);

    const code = await latestOtpCode(email, since);
    await page.getByLabel("Verification code").fill(code === "000000" ? "111111" : "000000");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText(
      "That code is incorrect or has expired.",
    );

    await page.getByLabel("Verification code").fill(code);
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("the code screen validates its input and can start over", async ({ page }) => {
    const email = await register(page);
    await signOut(page);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page.getByText("Enter the 6-digit code")).toBeVisible();
    await expect(page.getByRole("button", { name: /Resend code in \d+s/ })).toBeDisabled();

    await page.getByRole("button", { name: "Use a different account" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Email")).toHaveValue(email);
  });

  test("password visibility can be toggled", async ({ page }) => {
    await page.goto("/login");
    const field = page.getByLabel("Password", { exact: true });
    await expect(field).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show" }).click();
    await expect(field).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide" }).click();
    await expect(field).toHaveAttribute("type", "password");
  });

  test("updates profile details and persists them", async ({ page }) => {
    await register(page);
    await expect(page).toHaveURL(/\/account$/);
    await page.getByLabel("First name").fill("Augusta");
    await page.getByLabel("Phone (optional)").fill("+44 20 7946 0958");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("First name")).toHaveValue("Augusta");
    await expect(page.getByLabel("Phone (optional)")).toHaveValue("+44 20 7946 0958");

    await page.getByLabel("Phone (optional)").fill("abc");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Enter a valid phone number")).toBeVisible();
  });

  test("signing out of all devices ends other sessions too", async ({ page, browser }) => {
    const email = await register(page);
    await expect(page).toHaveURL(/\/account$/);

    const otherContext = await browser.newContext({
      extraHTTPHeaders: { "x-forwarded-for": randomIp() },
    });
    const other = await otherContext.newPage();
    await other.goto("/login");
    await other.getByLabel("Email").fill(email);
    await other.getByLabel("Password", { exact: true }).fill(password);
    await submitLoginAndEnterCode(other, email);
    await expect(other).toHaveURL(/\/account$/);

    await page.getByRole("button", { name: "Sign out of all devices" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await other.reload();
    await expect(other).toHaveURL(/\/login\?next=(%2F|\/)account$/);
    await otherContext.close();
  });

  test("the header account icon follows the session state", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/login");
    await register(page);
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
  });
});
