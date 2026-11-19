import { expect, test, type Page } from "@playwright/test";

const cards = (page: Page) => page.getByRole("article");
const priceOf = async (page: Page, index: number) => {
  const text = await cards(page)
    .nth(index)
    .getByText(/^\$\d+/)
    .first()
    .textContent();
  return Number(text?.replace(/[^0-9.]/g, ""));
};

test.describe("shop", () => {
  test("lists 12 products per page and paginates with cursors both ways", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("heading", { level: 1, name: "Shop all" })).toBeVisible();
    await expect(cards(page)).toHaveCount(12);
    await expect(page.getByText("Showing 1–12 products")).toBeVisible();
    await expect(page.getByText("Page 1")).toBeVisible();
    await expect(page.locator('span[aria-disabled="true"]', { hasText: "Previous" })).toBeVisible();

    const firstPageNames = await cards(page).getByRole("heading", { level: 3 }).allTextContents();

    await page.getByRole("link", { name: /Next/ }).click();
    await expect(page).toHaveURL(/after=/);
    await expect(page.getByText("Page 2")).toBeVisible();
    const secondPageNames = await cards(page).getByRole("heading", { level: 3 }).allTextContents();
    expect(secondPageNames.length).toBeGreaterThan(0);
    expect(secondPageNames.length).toBeLessThanOrEqual(12);
    for (const name of secondPageNames) expect(firstPageNames).not.toContain(name);

    await page.getByRole("link", { name: /Previous/ }).click();
    await expect(page.getByText("Page 1")).toBeVisible();
    expect(await cards(page).getByRole("heading", { level: 3 }).allTextContents()).toEqual(
      firstPageNames,
    );
  });

  test("availability filter updates the URL and results, and clears", async ({ page }) => {
    await page.goto("/shop");
    await page.getByRole("button", { name: /^Availability/ }).click();
    await page.getByRole("checkbox", { name: "Out of stock" }).click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/stock=out/);
    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByText("Golden Barrel Cactus")).toBeVisible();

    await page.getByRole("button", { name: "Clear all", exact: true }).click();
    await expect(page).not.toHaveURL(/stock=/);
    await expect(cards(page)).toHaveCount(12);
  });

  test("product type filter restricts results", async ({ page }) => {
    await page.goto("/shop");
    await page.getByRole("button", { name: /^Product type/ }).click();
    await page.getByRole("checkbox", { name: "Seeds & Tools" }).click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/type=Seeds/);
    await expect(cards(page)).toHaveCount(4);
    await expect(page.getByRole("navigation", { name: "Pagination" })).toHaveCount(0);
  });

  test("price filter applies on submit", async ({ page }) => {
    await page.goto("/shop");
    await page.getByRole("button", { name: /^Price/ }).click();
    await page.getByLabel("Minimum price").fill("40");
    await page.getByLabel("Maximum price").fill("60");
    await page.getByLabel("Maximum price").press("Enter");
    await expect(page).toHaveURL(/min=40/);
    const count = await cards(page).count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const price = await priceOf(page, i);
      expect(price).toBeGreaterThanOrEqual(40);
      expect(price).toBeLessThanOrEqual(60);
    }
  });

  test("sorting by price puts the cheapest first", async ({ page }) => {
    await page.goto("/shop?sort=price-asc");
    const first = await priceOf(page, 0);
    const second = await priceOf(page, 1);
    expect(first).toBeLessThanOrEqual(second);
    expect(first).toBe(18);
  });

  test("an empty result offers a way back", async ({ page }) => {
    await page.goto("/shop?min=99999");
    await expect(page.getByText("No products match your filters")).toBeVisible();
    await page.getByRole("link", { name: "Clear all filters" }).click();
    await expect(cards(page)).toHaveCount(12);
  });

  test("hostile query params never break the page", async ({ page }) => {
    const response = await page.goto(
      "/shop?sort=%3Cscript%3E&min=-1&after=%00%00&type=%22%20OR%20title%3A*",
    );
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Shop all" })).toBeVisible();
  });

  test("filtered and paginated URLs are noindex, the base page is indexable", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
    await page.goto("/shop?sort=price-asc");
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/shop$/);
  });
});
