import { expect, test } from "@playwright/test";

import { adminNav, audit, createAccount, randomIp, signInAdmin } from "./helpers/admin";

/**
 * The Shopify-backed modules (products, inventory, orders), Seal subscriptions and the page-content editor.
 * The e2e server runs with Shopify and Seal switched off, so these check that every screen opens, says plainly
 * that the service isn't connected (never a fake zero), has no accessibility violations and fits a phone.
 */
const SCREENS = [
  { path: "/admin/shop/products", heading: "Products" },
  { path: "/admin/shop/inventory", heading: "Inventory" },
  { path: "/admin/orders", heading: "Orders" },
  { path: "/admin/subscriptions", heading: "Subscriptions" },
  { path: "/admin/site/pages", heading: "Page content" },
  { path: "/admin/site/pages/home", heading: "Home page" },
  { path: "/admin/site/pages/care-guide", heading: "Plant care guide" },
  { path: "/admin/site/pages/faq", heading: "Frequently asked questions" },
  { path: "/admin/shop/products/new", heading: "New product" },
  { path: "/admin/reels", heading: "Reels" },
  { path: "/admin/marketing/campaigns", heading: "Campaigns" },
  { path: "/admin/marketing/campaigns/new", heading: "New campaign" },
] as const;

for (const [label, viewport] of [
  ["desktop", { width: 1280, height: 900 }],
  ["mobile", { width: 390, height: 800 }],
] as const) {
  test.describe(`new admin modules (${label})`, () => {
    test("every screen opens, is accessible and fits the screen", async ({
      page,
      request,
      baseURL,
    }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(viewport);
      await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
      const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
      await signInAdmin(page, email);
      for (const { path, heading } of SCREENS) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        await expect(page.getByRole("status").filter({ hasText: /^Loading/ })).toHaveCount(0, {
          timeout: 20_000,
        });
        expect(await audit(page), path).toEqual([]);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow, `${path} overflows`).toBe(false);
      }
    });
  });
}

test.describe("not connected", () => {
  test("Shopify and Seal outages are stated plainly, never shown as zero", async ({
    page,
    request,
    baseURL,
  }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);

    await page.goto("/admin/orders");
    await expect(page.getByRole("alert").filter({ hasText: "Shopify" })).toBeVisible();

    await page.goto("/admin/subscriptions");
    await expect(
      page.getByRole("heading", { name: "Seal Subscriptions isn't connected" }),
    ).toBeVisible();

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Business at a glance" })).toBeVisible();
    await expect(page.getByText("Unavailable.").first()).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Period" })).toHaveValue("30d");
    await page.getByRole("combobox", { name: "Period" }).selectOption("custom");
    await expect(page.getByLabel("From")).toBeVisible();
  });

  test("the sidebar lists the new sections", async ({ page, request, baseURL }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);
    for (const name of ["Orders", "Subscriptions", "Products", "Inventory", "Page content"]) {
      await expect(adminNav(page).getByRole("link", { name })).toBeVisible();
    }
  });
});
