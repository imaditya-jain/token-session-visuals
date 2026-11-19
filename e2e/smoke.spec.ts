import { expect, test } from "@playwright/test";

/** Fast, non-visual checks. These also run against production after every deploy. */

test.describe("smoke", () => {
  for (const path of ["/", "/collections/house-plants", "/products/monstera-deliciosa"]) {
    test(`${path} renders without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(err.message));

      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: "Fernwood" }).first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("unknown routes return 404", async ({ page }) => {
    const response = await page.goto("/products/does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
  });

  test("home → collection → product navigation works", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Shop indoor plants" }).click();
    await expect(page).toHaveURL(/\/collections\/house-plants$/);
    await page
      .getByRole("link", { name: /^View / })
      .first()
      .click();
    await expect(page).toHaveURL(/\/products\/[a-z0-9-]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("collection filters and sorting update the grid", async ({ page }) => {
    await page.goto("/collections/house-plants");
    const count = page.getByText(/^\d+ products?$/);
    const before = await count.textContent();
    await page.getByRole("button", { name: /^Availability/ }).click();
    await page.getByRole("checkbox").nth(1).click();
    await page.keyboard.press("Escape");
    await expect(count).not.toHaveText(before ?? "");
    await page.getByRole("button", { name: "Clear all", exact: true }).click();
    await expect(count).toHaveText(before ?? "");
  });

  test("search overlay opens and closes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByPlaceholder("Search plants, pots, tools…")).toBeVisible();
    await page.getByRole("button", { name: "Close search" }).click();
    await expect(page.getByPlaceholder("Search plants, pots, tools…")).toBeHidden();
  });
});

test.describe("cart UI", () => {
  test("header shows no badge for an empty cart and opens the empty mini-cart", async ({
    page,
  }) => {
    await page.goto("/");
    const cart = page.getByRole("button", { name: "Cart, 0 items" });
    await expect(cart).toBeVisible();
    await cart.click();
    const dialog = page.getByRole("dialog", { name: "Your cart" });
    await expect(dialog.getByText("Your cart is empty")).toBeVisible();
    await dialog.getByRole("link", { name: "Shop all plants" }).click();
    await expect(page).toHaveURL(/\/shop$/);
  });

  test("an unavailable store is reported on the card, not silently ignored", async ({ page }) => {
    await page.goto("/shop");
    const add = page.getByRole("button", { name: /^Try again: add|^Add to cart: / }).first();
    await add.click({ force: true });
    await expect(add).toHaveText(/Try again/);
  });
});
