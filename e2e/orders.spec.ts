import { expect, test, type Page } from "@playwright/test";

import { latestEmailLink, toLocal } from "./helpers/mailbox";

const password = "correct-horse-battery";
const randomIp = () => `192.0.2.${1 + Math.floor(Math.random() * 250)}`;
const uniqueEmail = () =>
  `orders+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function register(page: Page, email = uniqueEmail()) {
  await page.goto("/register");
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return email;
}

/** Registers and confirms the email through the emailed link, like a real customer. */
async function verifiedCustomer(page: Page, baseURL: string) {
  const email = await register(page);
  await page.goto(toLocal(await latestEmailLink("verify-email", email), baseURL));
  await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
  return email;
}

const money = (amount: string) => ({ amount, currency: "USD" });
const order = (id: number, extra: Record<string, unknown> = {}) => ({
  id: String(id),
  name: `#${id}`,
  processedAt: "2026-10-12T15:30:00Z",
  financialStatus: "PAID",
  fulfillmentStatus: "FULFILLED",
  cancelled: false,
  total: money("84.00"),
  itemCount: 3,
  previewImages: ["/images/product-monstera.jpg", "/images/product-watering-can.jpg"],
  ...extra,
});
const detail = {
  ...order(1002),
  lines: [
    {
      title: "Monstera Deliciosa",
      quantity: 1,
      image: "/images/product-monstera.jpg",
      unitPrice: money("49.00"),
    },
    { title: "Brass Watering Can", variantTitle: "Large", quantity: 2, unitPrice: money("10.50") },
  ],
  subtotal: money("70.00"),
  shipping: money("8.00"),
  tax: money("6.00"),
  tracking: [
    {
      company: "USPS",
      number: "9400 1000",
      url: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400",
    },
    { company: "Local courier", number: "ABC-1", url: "javascript:alert(1)" },
  ],
  shippingAddress: { city: "Portland", region: "Oregon", country: "United States" },
};
const ok = (data: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({ data }),
});
const pageInfo = { hasNextPage: false, hasPreviousPage: false };

test.describe("orders", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  });

  test("anonymous visitors are sent to sign in and come back afterwards", async ({ page }) => {
    await page.goto("/account/orders");
    await expect(page).toHaveURL(/\/login\?next=(%2F|\/)account(%2F|\/)orders$/);
  });

  test("an unverified account is asked to confirm its email (server-enforced)", async ({
    page,
  }) => {
    await register(page);
    await page.goto("/account/orders");
    await expect(
      page.getByRole("heading", { name: "Confirm your email to see your orders" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Go to my account" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("a verified account sees a friendly message when order lookup is unavailable, and can retry", async ({
    page,
    baseURL,
  }) => {
    await verifiedCustomer(page, baseURL!);
    await page.goto("/account/orders");
    await expect(page.getByRole("heading", { name: "We couldn't load your orders" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("shows an empty state with a way to start shopping", async ({ page, baseURL }) => {
    await verifiedCustomer(page, baseURL!);
    await page.route("**/api/orders", (route) => route.fulfill(ok({ orders: [], pageInfo })));
    await page.goto("/account/orders");
    await expect(page.getByRole("heading", { name: "No orders yet" })).toBeVisible();
    await page.getByRole("link", { name: "Start shopping" }).click();
    await expect(page).toHaveURL(/\/shop$/);
  });

  test("lists orders and paginates with cursors", async ({ page, baseURL }) => {
    await verifiedCustomer(page, baseURL!);
    const requests: string[] = [];
    await page.route(/\/api\/orders(\?.*)?$/, (route) => {
      const search = new URL(route.request().url()).search;
      requests.push(search);
      return route.fulfill(
        search.includes("after=E1")
          ? ok({
              orders: [order(1001)],
              pageInfo: {
                hasNextPage: false,
                hasPreviousPage: true,
                startCursor: "S2",
                endCursor: "E2",
              },
            })
          : ok({
              orders: [order(1003), order(1002)],
              pageInfo: {
                hasNextPage: true,
                hasPreviousPage: search.includes("before="),
                startCursor: "S1",
                endCursor: "E1",
              },
            }),
      );
    });

    await page.goto("/account/orders");
    await expect(page.getByRole("heading", { name: "Order #1003" })).toBeVisible();
    await expect(page.getByText("$84.00").first()).toBeVisible();
    await expect(page.getByText("Placed October 12, 2026 · 3 items").first()).toBeVisible();
    await expect(page.locator('span[aria-disabled="true"]', { hasText: "Previous" })).toBeVisible();

    await page.getByRole("link", { name: /Next/ }).click();
    await expect(page).toHaveURL(/after=E1/);
    await expect(page.getByRole("heading", { name: "Order #1001" })).toBeVisible();
    expect(requests.some((search) => search.includes("after=E1"))).toBe(true);

    await page.getByRole("link", { name: /Previous/ }).click();
    await expect(page.getByRole("heading", { name: "Order #1003" })).toBeVisible();
  });

  test("opens an order with lines, totals and tracking; unsafe tracking links are not clickable", async ({
    page,
    baseURL,
  }) => {
    await verifiedCustomer(page, baseURL!);
    await page.route("**/api/orders", (route) =>
      route.fulfill(ok({ orders: [order(1002)], pageInfo })),
    );
    await page.route("**/api/orders/1002", (route) => route.fulfill(ok({ order: detail })));

    await page.goto("/account/orders");
    await page.getByRole("link", { name: "View order #1002" }).click();
    await expect(page).toHaveURL(/\/account\/orders\/1002$/);
    await expect(page.getByRole("heading", { name: "Order #1002" })).toBeVisible();
    await expect(page.getByText("Brass Watering Can")).toBeVisible();
    await expect(page.getByText("2 × $10.50")).toBeVisible();
    await expect(page.getByText("$84.00").last()).toBeVisible();
    await expect(page.getByText("Portland, Oregon, United States")).toBeVisible();

    const safe = page.getByRole("link", { name: "USPS · 9400 1000" });
    await expect(safe).toHaveAttribute("rel", "noopener noreferrer");
    await expect(safe).toHaveAttribute("target", "_blank");
    await expect(page.getByRole("link", { name: /Local courier/ })).toHaveCount(0);
    await expect(page.getByText("Local courier · ABC-1")).toBeVisible();
  });

  test("an unknown or foreign order shows a not-found message", async ({ page, baseURL }) => {
    await verifiedCustomer(page, baseURL!);
    await page.route("**/api/orders/424242", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "not_found", message: "Order not found" } }),
      }),
    );
    await page.goto("/account/orders/424242");
    await expect(page.getByRole("heading", { name: "We couldn't find that order" })).toBeVisible();
    await page.getByRole("link", { name: "Back to orders" }).click();
    await expect(page).toHaveURL(/\/account\/orders$/);
  });
});

test.describe("orders visual lock", () => {
  const viewports = [
    { name: "mobile", width: 360, height: 780 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    test(`orders list and detail @ ${viewport.name}`, async ({ page, baseURL }) => {
      await page.context().setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await verifiedCustomer(page, baseURL!);
      await page.route("**/api/orders", (route) =>
        route.fulfill(
          ok({
            orders: [
              order(1003),
              order(1002, { cancelled: true, fulfillmentStatus: "UNFULFILLED" }),
            ],
            pageInfo: {
              hasNextPage: true,
              hasPreviousPage: false,
              startCursor: "S",
              endCursor: "E",
            },
          }),
        ),
      );
      await page.route("**/api/orders/1002", (route) => route.fulfill(ok({ order: detail })));

      await page.goto("/account/orders");
      await expect(page.getByRole("heading", { name: "Order #1003" })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({
        content: "*,*::before,*::after{animation:none!important;transition:none!important}",
      });
      await page.waitForFunction(() => [...document.images].every((image) => image.complete));
      await expect(page).toHaveScreenshot(`orders-list-${viewport.name}.png`, { fullPage: true });

      await page.goto("/account/orders/1002");
      await expect(page.getByRole("heading", { name: "Order #1002" })).toBeVisible();
      await page.waitForFunction(() => [...document.images].every((image) => image.complete));
      await expect(page).toHaveScreenshot(`order-detail-${viewport.name}.png`, { fullPage: true });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      ).toBe(false);
    });
  }
});
