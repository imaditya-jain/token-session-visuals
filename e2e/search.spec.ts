import { expect, test } from "@playwright/test";

test.describe("search", () => {
  test("overlay → results page → product", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("searchbox", { name: "Search" }).fill("monst");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/search\?q=monst$/);
    await expect(page.getByPlaceholder("Search plants, pots, tools…")).toBeHidden();
    await expect(page.getByText("Results for “monst”")).toBeVisible();
    await expect(page.getByText("1 product", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "View Monstera Deliciosa" }).click();
    await expect(page).toHaveURL(/\/products\/monstera-deliciosa$/);
  });

  test("multi-word queries must match every word", async ({ page }) => {
    await page.goto("/search?q=snake+plant");
    await expect(page.getByRole("link", { name: "View Snake Plant Laurentii" })).toBeVisible();
    await page.goto("/search?q=snake+zzzz");
    await expect(page.getByText("No results for “snake zzzz”")).toBeVisible();
    await expect(page.getByRole("link", { name: "Shop all plants" })).toBeVisible();
  });

  test("filters keep the search term", async ({ page }) => {
    await page.goto("/search?q=plant&stock=in&sort=price-asc");
    await expect(page.getByText(/products?$/).first()).toBeVisible();
    await page.getByRole("button", { name: /Clear all/ }).click();
    await expect(page).toHaveURL(/q=plant/);
    await expect(page).not.toHaveURL(/stock=/);
  });

  test("empty query shows a prompt and is not indexed", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByText("What are you looking for?")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await page.goto("/search?q=%22%3E%3Cscript%3Ealert(1)%3C/script%3E");
    await expect(page.locator("script", { hasText: "alert(1)" })).toHaveCount(0);
    await expect(
      page.getByText("Results for “script alert 1 script”", { exact: true }),
    ).toBeVisible();
  });

  test("blank submissions do nothing and Escape closes the overlay", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("searchbox", { name: "Search" }).fill("   ");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/$/);
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder("Search plants, pots, tools…")).toBeHidden();
  });

  test("pathological input never breaks the page", async ({ request }) => {
    for (const q of ["x".repeat(5000), "%00", "a%20".repeat(100), "{$ne:1}", "💥🌿"]) {
      const response = await request.get(`/search?q=${q}`);
      expect(response.status()).toBe(200);
    }
  });
});
