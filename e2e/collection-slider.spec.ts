import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Home collections slider", () => {
  test("arrows and dots move the strip, and the section passes accessibility checks", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const section = page.locator("#collections");
    await section.scrollIntoViewIfNeeded();
    const strip = section.getByRole("list", { name: "Shop house plants" });
    await expect(section.getByRole("button", { name: "Previous collections" })).toBeDisabled();

    await section.getByRole("button", { name: "Next collections" }).click();
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);

    await section.getByRole("button", { name: /Go to collection 1 of/ }).click();
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeLessThan(5);

    await expect(section.getByRole("link", { name: /View all collections/ })).toHaveAttribute(
      "href",
      "/collections",
    );
    const results = await new AxeBuilder({ page })
      .include("#collections")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .disableRules(["color-contrast"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("on a phone the strip scrolls sideways by touch and the page does not", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const strip = page.locator("#collections").getByRole("list", { name: "Shop house plants" });
    await strip.scrollIntoViewIfNeeded();
    await expect.poll(() => strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
