import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const audit = async (page: Page): Promise<string[]> =>
  (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .disableRules(["color-contrast"])
      .analyze()
  ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);

// The e2e catalogue is the built-in one (no bouquets), so the page shows its empty state. Product behaviour with
// bouquets is covered by the unit and API tests; the real shop gets its bouquets from Shopify.
test.describe("Gifts & bouquets", () => {
  for (const [name, size] of [
    ["desktop", { width: 1280, height: 900 }],
    ["phone", { width: 375, height: 800 }],
  ] as const) {
    test(`page renders, is accessible and fits the screen (${name})`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/gifts");
      await expect(
        page.getByRole("heading", { level: 1, name: "Say it with flowers" }),
      ).toBeVisible();
      await expect(page.getByText("Fresh bouquets: Nagpur only.")).toBeVisible();
      await expect(page.getByText(/Our first bouquets are on their way/)).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Three steps to a lovely surprise" }),
      ).toBeVisible();
      expect(await audit(page)).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      ).toBe(false);
    });
  }

  test("is in the sitemap, and the home page invites people to it", async ({ page, request }) => {
    expect(await (await request.get("/sitemap.xml")).text()).toContain("/gifts");
    await page.goto("/");
    const teaser = page.locator("#gifts");
    await expect(
      teaser.getByRole("heading", { name: "Fresh flowers, delivered in Nagpur" }),
    ).toBeVisible();
    await teaser.getByRole("link", { name: /Shop gifts & bouquets/ }).click();
    await expect(page).toHaveURL(/\/gifts$/);
  });
});
