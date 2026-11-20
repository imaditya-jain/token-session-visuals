import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

const randomIp = () =>
  `198.19.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
const PASSWORD = "correct-horse-battery";

test.describe("privacy: download and delete your data", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  });

  async function registerAndOpenAccount(page: import("@playwright/test").Page) {
    const email = `privacy+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    await page.goto("/register");
    await page.getByLabel("First name").fill("Grace");
    await page.getByLabel("Last name").fill("Hopper");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByRole("heading", { name: "Your data" })).toBeVisible();
    return email;
  }

  test("a person can download their own data", async ({ page }) => {
    const email = await registerAndOpenAccount(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download my data" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("fernwood-my-data.json");
    const file = JSON.parse(readFileSync((await download.path())!, "utf8"));
    expect(file.account).toMatchObject({ email, firstName: "Grace", lastName: "Hopper" });
    expect(JSON.stringify(file)).not.toMatch(/passwordHash|tokenHash/);
    await expect(page.getByText("Your file was downloaded.")).toBeVisible();
  });

  test("deleting needs the right password, then removes the account for good", async ({
    page,
    request,
  }) => {
    const email = await registerAndOpenAccount(page);

    await page.getByRole("button", { name: /Delete my account/ }).click();
    const confirm = page.getByRole("button", { name: "Permanently delete my account" });
    await expect(confirm).toBeDisabled();

    await page.getByLabel("Confirm with your password").fill("not-the-password");
    await confirm.click();
    await expect(page.getByText("That password is incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/account/);

    await page.getByLabel("Confirm with your password").fill(PASSWORD);
    await confirm.click();
    await expect(page).toHaveURL(/\/login\?deleted=1/);
    await expect(
      page.getByRole("status").filter({ hasText: "Your account has been deleted" }),
    ).toBeVisible();

    // The account is really gone: the same credentials no longer work.
    const login = await request.post("/api/auth/login", {
      data: { email, password: PASSWORD },
      headers: { origin: page.url().split("/login")[0] ?? "" },
    });
    expect(login.status()).toBe(401);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);
  });

  test("cancelling leaves the account alone", async ({ page }) => {
    await registerAndOpenAccount(page);
    await page.getByRole("button", { name: /Delete my account/ }).click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: /Delete my account/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Delete account" })).toBeVisible();
  });
});
