import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

import { latestOtpCode, promoteToAdmin } from "./mailbox";

export const PASSWORD = "admin-test-password-1";

export const randomIp = () =>
  `198.19.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

export const uniqueEmail = (tag: string) =>
  `${tag}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** Registers a customer account, optionally promoting it to an admin role in the throwaway database. */
export async function createAccount(
  request: APIRequestContext,
  baseURL: string,
  tag = "user",
  adminRole?: string,
): Promise<string> {
  const email = uniqueEmail(tag);
  const response = await request.post("/api/auth/register", {
    data: { email, password: PASSWORD, firstName: "Ada", lastName: "Lovelace" },
    headers: { origin: baseURL, "x-forwarded-for": randomIp() },
  });
  expect(response.status()).toBe(201);
  if (adminRole) await promoteToAdmin(email, adminRole);
  return email;
}

/** The real two-step sign-in: password, then the emailed code. */
export async function signInAdmin(page: Page, email: string): Promise<void> {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  const since = new Date(Date.now() - 1000);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Verification code").fill(await latestOtpCode(email, since));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Axe violations (WCAG 2.2 A/AA plus best practice; colour contrast is the project's known, owner-level exception). */
export const audit = async (page: Page): Promise<string[]> =>
  (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .disableRules(["color-contrast"])
      .analyze()
  ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);

export const adminNav = (page: Page) => page.getByRole("navigation", { name: "Admin sections" });
