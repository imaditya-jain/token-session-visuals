import { expect, test, type Page } from "@playwright/test";

const randomIp = () =>
  `198.51.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

/** Records every CSP violation the browser reports, before any page script runs. */
async function watchViolations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      w.__csp.push(`${event.violatedDirective} ← ${event.blockedURI || "inline"}`);
    });
  });
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy/i.test(message.text()))
      consoleErrors.push(message.text());
  });
  return async () => {
    const reported = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
    return [...reported, ...consoleErrors];
  };
}

test.describe("content security policy does not break the site", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  });

  test("every page hydrates and works with zero violations", async ({ page }) => {
    const violations = await watchViolations(page);

    for (const path of [
      "/",
      "/collections/house-plants",
      "/products/monstera-deliciosa",
      "/shop",
      "/search?q=plant",
      "/about",
      "/care-guide",
      "/contact",
      "/policies/privacy-policy",
      "/login",
      "/register",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // Hydration proof: a client-only interaction works (the header search button opens the overlay).
      await page.getByRole("button", { name: "Search" }).click();
      await expect(page.getByPlaceholder("Search plants, pots, tools…")).toBeVisible();
      await page.getByRole("button", { name: "Close search" }).click();
    }
    // The 404 page has no header, so it is only checked for violations.
    await page.goto("/this-page-does-not-exist");
    await page.waitForLoadState("networkidle");
    expect(await violations()).toEqual([]);
  });

  test("overlays, popovers and forms work with zero violations", async ({ page }) => {
    const violations = await watchViolations(page);

    await page.goto("/shop");
    await page.getByRole("button", { name: /^Price/ }).click();
    await expect(page.getByLabel(/min/i).first()).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /^Cart/ }).click();
    await expect(page.getByRole("dialog", { name: "Your cart" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 390, height: 800 });
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("navigation").first()).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/contact");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("This field is required").first()).toBeVisible();

    expect(await violations()).toEqual([]);
  });

  test("injected script and inline handlers do not execute", async ({ page }) => {
    await page.goto("/search?q=%3Cimg+src%3Dx+onerror%3Dwindow.__pwned%3D1%3E");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBe(
      undefined,
    );
  });
});
