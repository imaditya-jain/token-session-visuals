import { expect, test } from "@playwright/test";

/**
 * The shop and collection pages without filters are prebuilt and cached (no server work per visit); any filter,
 * sort or page switches to a per-request render. Both must look and behave the same.
 */
const cacheControl = async (request: import("@playwright/test").APIRequestContext, path: string) =>
  (await request.get(path)).headers()["cache-control"] ?? "";

test.describe("prebuilt listings", () => {
  test("the plain shop and collection are cached pages", async ({ request }) => {
    for (const path of [
      "/shop",
      "/collections/house-plants",
      "/shop?utm_source=newsletter&fbclid=abc",
    ]) {
      const header = await cacheControl(request, path);
      expect(header, path).toContain("s-maxage");
      expect(header, path).not.toContain("no-store");
    }
  });

  test("any filter, sort, search or page is rendered per request", async ({ request }) => {
    for (const path of [
      "/shop?sort=price-asc",
      "/shop?stock=in",
      "/shop?type=Houseplants",
      "/shop?min=10&max=50",
      "/shop?page=2",
      "/collections/house-plants?sort=alpha-desc",
    ]) {
      expect(await cacheControl(request, path), path).toMatch(/no-store|private/);
    }
  });

  test("a filter chosen on the cached page works and can be cleared", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("combobox", { name: "Sort products" }).click();
    await page.getByRole("option", { name: "Price, low to high" }).click();
    await expect(page).toHaveURL(/sort=price-asc/);
    await expect(page.getByRole("combobox", { name: "Sort products" })).toContainText(
      "Price, low to high",
    );
    await page.goto("/shop");
    await expect(page).toHaveURL(/\/shop$/);
  });

  test("the internal address is never a place visitors can land", async ({ page }) => {
    await page.goto("/listing/shop");
    await expect(page).toHaveURL(/\/shop$/);
    await page.goto("/listing/collections/house-plants?sort=alpha-asc");
    await expect(page).toHaveURL(/\/collections\/house-plants\?sort=alpha-asc$/);
  });

  test("the cached page says it is the real address, and the internal one is hidden from search", async ({
    request,
  }) => {
    const html = await (await request.get("/shop")).text();
    expect(html).toContain('rel="canonical" href="http://localhost:3100/shop"');
    expect(html).not.toContain("/listing/shop");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /listing/");
  });

  test("an unknown collection is still a 404", async ({ request }) => {
    expect((await request.get("/collections/does-not-exist")).status()).toBe(404);
  });
});
