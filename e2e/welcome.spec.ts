import { expect, test } from "@playwright/test";

// Visitors who have not switched the welcome off (the rest of the suite does, through the config's storage state).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Welcome on the home page", () => {
  test("plays on the first visit of a session, can be skipped, and does not come back", async ({
    page,
  }) => {
    await page.goto("/");
    const welcome = page.locator("#fw-welcome");
    await expect(welcome).toBeVisible();
    await expect(page.getByText("Step into the greenhouse")).toBeVisible();
    await expect(page.locator("#fw-welcome-greeting")).toContainText(/Take your time/);
    await expect(page.locator("#fw-welcome-tip")).not.toBeEmpty();

    await page.getByRole("button", { name: "Skip" }).click();
    await expect(welcome).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe(
      "hidden",
    );

    await page.reload();
    await expect(page.locator("#fw-welcome")).toBeHidden();
  });

  test("finishes by itself and leaves the home page usable", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#fw-welcome")).toBeVisible();
    await expect(page.locator("#fw-welcome")).toBeHidden({ timeout: 8000 });
    await page.getByRole("link", { name: /shop/i }).first().waitFor();
  });

  test("is not shown on other pages, to people who prefer less motion, or to visitors from a search engine", async ({
    browser,
  }) => {
    const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await other.newPage();
    await page.goto("/about");
    await expect(page.locator("#fw-welcome")).toHaveCount(0);
    await other.close();

    const reduced = await browser.newContext({
      reducedMotion: "reduce",
      storageState: { cookies: [], origins: [] },
    });
    const rp = await reduced.newPage();
    await rp.goto("/");
    await expect(rp.locator("#fw-welcome")).toBeHidden();
    await reduced.close();

    const fromSearch = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const sp = await fromSearch.newPage();
    await sp.goto("/", { referer: "https://www.google.com/" });
    await expect(sp.locator("#fw-welcome")).toBeHidden();
    await fromSearch.close();
  });

  test("shows the home page content in the HTML, so search engines and slow phones still see the page", async ({
    request,
  }) => {
    const html = await (await request.get("/")).text();
    expect(html).toContain("fw-welcome");
    expect(html).toMatch(/<h1[^>]*>/);
    expect(html).toContain("Shop house plants");
  });
});
