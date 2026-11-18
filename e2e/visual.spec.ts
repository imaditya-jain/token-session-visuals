import { expect, test, type Page } from "@playwright/test";

/**
 * Design lock. These golden screenshots were captured from the original
 * Lovable build and must never change. Any diff means UI/UX drifted.
 */
const viewports = [
  { name: "mobile", width: 360, height: 780 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
];

const pages = [
  { name: "home", path: "/" },
  { name: "collection", path: "/collections/house-plants" },
  { name: "product", path: "/products/monstera-deliciosa" },
  { name: "shop", path: "/shop" },
];

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important}",
  });
  // Trigger lazy images, then return to top.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
}

for (const vp of viewports) {
  for (const p of pages) {
    test(`${p.name} @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(p.path);
      await settle(page);
      await expect(page).toHaveScreenshot(`${p.name}-${vp.name}.png`, { fullPage: true });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, "horizontal overflow").toBe(false);
    });
  }
}

test("mobile menu open", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await settle(page);
  await page.getByRole("button", { name: /menu/i }).first().click();
  await expect(page).toHaveScreenshot("mobile-menu.png");
});

test("search overlay open", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await settle(page);
  await page
    .getByRole("button", { name: /search/i })
    .first()
    .click();
  await expect(page).toHaveScreenshot("search-overlay.png");
});
