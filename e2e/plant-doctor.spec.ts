import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const audit = async (page: Page): Promise<string[]> =>
  (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .disableRules(["color-contrast"])
      .analyze()
  ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);

// The e2e server has no AI key, so the page shows its "almost ready" state. The full flow (photo in, diagnosis out)
// is covered against a mocked model in src/app/api/plant-doctor/plant-doctor.int.test.ts.
test.describe("Plant Doctor page", () => {
  for (const [name, size] of [
    ["desktop", { width: 1280, height: 900 }],
    ["phone", { width: 375, height: 800 }],
  ] as const) {
    test(`renders, is accessible and fits the screen (${name})`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/plant-doctor");
      await expect(page.getByRole("heading", { level: 1, name: "Plant Doctor" })).toBeVisible();
      await expect(page.getByText("The Plant Doctor is almost ready")).toBeVisible();
      expect(await audit(page)).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);
    });
  }

  test("is in the sitemap and has the right title", async ({ page, request }) => {
    expect(await page.goto("/plant-doctor").then((r) => r?.status())).toBe(200);
    await expect(page).toHaveTitle(/Plant Doctor/);
    expect(await (await request.get("/sitemap.xml")).text()).toContain("/plant-doctor");
  });
});
