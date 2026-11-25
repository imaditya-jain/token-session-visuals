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
  test("lists 12 products per page and pages forward and back in the browser", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("heading", { level: 1, name: "Shop all" })).toBeVisible();
    await expect(cards(page)).toHaveCount(12);
    await expect(page.getByText("Showing 1–12 products")).toBeVisible();
    await expect(page.getByText("Page 1")).toBeVisible();
    await expect(page.locator('span[aria-disabled="true"]', { hasText: "Previous" })).toBeVisible();

    const firstPageNames = await cards(page).getByRole("heading", { level: 3 }).allTextContents();

    await page.getByRole("link", { name: /Next/ }).click();
    await expect(page).toHaveURL(/page=2/);
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
    // The address is applied as soon as the page has loaded in the browser.
    await expect.poll(() => priceOf(page, 0)).toBe(18);
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

  test("every filtered address is the same cached page and names the plain shop as its canonical", async ({
    page,
    request,
  }) => {
    for (const path of ["/shop", "/shop?sort=price-asc", "/shop?page=2&stock=in"]) {
      const response = await request.get(path);
      expect(response.headers()["cache-control"], path).toContain("s-maxage");
    }
    await page.goto("/shop?sort=price-asc");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/shop$/);
  });

  test("a filtered address opens already filtered, and back/forward follow the filters", async ({
    page,
  }) => {
    await page.goto("/shop?type=Seeds%20%26%20Tools");
    await expect(cards(page)).toHaveCount(4);
    await page.getByRole("button", { name: "Clear all", exact: true }).click();
    await expect(cards(page)).toHaveCount(12);
    await page.goBack();
    await expect(cards(page)).toHaveCount(4);
    await page.goForward();
    await expect(cards(page)).toHaveCount(12);
  });

  test("changing a filter never asks the server for a new page", async ({ page }) => {
    await page.goto("/shop");
    await expect(cards(page)).toHaveCount(12);
    // Links in view are prefetched in the background (that is not a page being requested for a filter), so only
    // real requests for the shop page itself count.
    const pageRequests: string[] = [];
    page.on("request", (request) => {
      const prefetch = "next-router-prefetch" in request.headers();
      if (new URL(request.url()).pathname === "/shop" && !prefetch)
        pageRequests.push(request.url());
    });
    await page.getByRole("button", { name: /^Availability/ }).click();
    await page.getByRole("checkbox", { name: "In stock" }).click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/stock=in/);
    await page.getByRole("combobox", { name: "Sort products" }).click();
    await page.getByRole("option", { name: "Price, high to low" }).click();
    await expect(page).toHaveURL(/sort=price-desc/);
    await page.getByRole("link", { name: /Next/ }).click();
    await expect(page).toHaveURL(/page=2/);
    expect(pageRequests).toEqual([]);
  });
});
