import { expect, test } from "@playwright/test";

import { seedNotifications } from "./helpers/mailbox";

const randomIp = () =>
  `198.18.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

test.describe("order updates on the account page", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  });

  async function signUp(page: import("@playwright/test").Page) {
    const email = `notify+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    await page.goto("/register");
    await page.getByLabel("First name").fill("Ada");
    await page.getByLabel("Last name").fill("Lovelace");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
    await page.getByRole("button", { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/account/);
    return email;
  }

  test("shows a friendly empty state before anything has happened", async ({ page }) => {
    await signUp(page);
    await expect(page.getByRole("heading", { name: "Order updates" })).toBeVisible();
    await expect(page.getByText(/No updates yet/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark all as read" })).toHaveCount(0);
  });

  test("lists updates, links to the order, and marks everything read", async ({ page }) => {
    const email = await signUp(page);
    await seedNotifications(email, [
      {
        title: "Order #1002 is on its way",
        body: "Your order has shipped.",
        link: "/account/orders/1002",
      },
      {
        title: "Order #1001 received",
        body: "Thank you for your order.",
        link: "/account/orders/1001",
      },
    ]);
    await page.reload();

    const section = page.getByRole("region", { name: /Order updates/ });
    await expect(section.getByText("2 new")).toBeVisible();
    await expect(section.getByText("Order #1002 is on its way")).toBeVisible();
    await expect(section.getByText("New", { exact: true })).toHaveCount(2);
    await expect(section.getByRole("link", { name: "View order" }).first()).toHaveAttribute(
      "href",
      "/account/orders/1002",
    );

    await section.getByRole("button", { name: "Mark all as read" }).click();
    await expect(section.getByText("2 new")).toHaveCount(0);
    await expect(section.getByText("New", { exact: true })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "Mark all as read" })).toHaveCount(0);

    // Still read after a reload: it was saved on the server, not just hidden.
    await page.reload();
    await expect(
      page.getByRole("region", { name: /Order updates/ }).getByText("2 new"),
    ).toHaveCount(0);
    await expect(page.getByText("Order #1001 received")).toBeVisible();
  });
});
