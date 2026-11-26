import { expect, test } from "@playwright/test";

import { adminNav, audit, createAccount, signInAdmin } from "./helpers/admin";

/**
 * Edits and publishes the header, footer and social links, which changes every storefront page. It lives in its
 * own Playwright project that runs after all other tests (see playwright.config.ts), and the steps depend on each
 * other, so they run in order in one worker.
 */
test.describe.configure({ mode: "serial" });

test.describe("header, footer and social links", () => {
  test("edits stay private as a draft, then go live on every page when published", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);

    // The storefront starts with the original content.
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Announcement" })).toContainText(
      "Free shipping on orders over $75",
    );
    await expect(page.getByRole("link", { name: "Journal" }).first()).toBeVisible();

    // Header: switch the announcement off, add a menu item with a dropdown.
    await page.goto("/admin/site/header");
    await expect(adminNav(page).getByRole("link", { name: "Header & announcement" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Header & announcement" }),
    ).toBeVisible();
    await page.getByLabel("Show the announcement bar").uncheck();
    await page.getByRole("button", { name: "Add a menu item" }).click();
    const items = page.getByRole("list", { name: "Menu items" }).locator("> li");
    const last = items.nth(4);
    await last.getByLabel("Label", { exact: true }).first().fill("Presents");
    await last.getByLabel("Link", { exact: true }).first().fill("/gift-cards");
    await last.getByRole("button", { name: "Add a dropdown link" }).click();
    await last.getByLabel("Label", { exact: true }).nth(1).fill("Gift cards");
    await last.getByLabel("Link", { exact: true }).nth(1).fill("/gift-cards");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();

    // A draft is invisible on the storefront.
    const draftPage = await (await request.get("/")).text();
    expect(draftPage).toContain("Free shipping on orders over $75");
    expect(draftPage).not.toContain("Presents");

    // Footer + social (same draft).
    await adminNav(page).getByRole("link", { name: "Footer" }).click();
    await page.getByLabel("Copyright text").fill("Fernwood Test Nursery. All rights reserved.");
    await page.getByLabel("Heading", { exact: true }).fill("Join the e2e club");
    await page.getByRole("button", { name: "Add a column" }).click();
    const columns = page.getByRole("list", { name: "Footer columns" }).locator("> li");
    const extra = columns.nth(3);
    await extra.getByLabel("Column heading").fill("Extras");
    await extra.getByRole("button", { name: "Add link" }).click();
    await extra.getByLabel("Label", { exact: true }).fill("Plant swap");
    await extra.getByLabel("Link", { exact: true }).fill("/contact");
    await adminNav(page).getByRole("link", { name: "Social links" }).click();
    await page.getByLabel("Instagram address").fill("https://instagram.com/fernwood-e2e");
    await page.getByRole("button", { name: "Pinterest" }).click();
    await page.getByLabel("Pinterest address").fill("https://pinterest.com/fernwood-e2e");
    await page.getByLabel("Show Pinterest").check();
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Published\./ })).toContainText(
      "hidden",
    );
    await expect(page.getByRole("status").filter({ hasText: /Facebook/ })).toBeVisible();
  });

  test("the published content is live on the storefront", async ({ page }) => {
    await page.goto("/");
    // Announcement is gone; the new menu item and its dropdown are there.
    await expect(page.getByRole("region", { name: "Announcement" })).toHaveCount(0);
    const nav = page.locator("header nav").first();
    await expect(nav.getByRole("link", { name: "Presents" })).toBeVisible();
    await nav.getByRole("link", { name: "Presents" }).hover();
    await expect(nav.getByRole("link", { name: "Gift cards" })).toBeVisible();

    // Footer: the new copyright, only the enabled social icons with their real, safe links.
    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText("Fernwood Test Nursery. All rights reserved.");
    await expect(
      footer.getByRole("navigation", { name: "Extras" }).getByRole("link", { name: "Plant swap" }),
    ).toHaveAttribute("href", "/contact");
    const instagram = footer.getByRole("link", { name: "Instagram" });
    await expect(instagram).toHaveAttribute("href", "https://instagram.com/fernwood-e2e");
    await expect(instagram).toHaveAttribute("rel", "noopener noreferrer");
    await expect(footer.getByRole("link", { name: "Pinterest" })).toHaveAttribute(
      "href",
      "https://pinterest.com/fernwood-e2e",
    );
    for (const hidden of ["Facebook", "Twitter", "YouTube"]) {
      await expect(footer.getByRole("link", { name: hidden })).toHaveCount(0);
    }
    await expect(page.getByRole("heading", { name: "Join the e2e club" })).toBeVisible();

    // The same chrome on a different kind of page (a server-rendered one and a content page).
    for (const path of ["/shop", "/about", "/blog"]) {
      await page.goto(path);
      await expect(page.getByRole("region", { name: "Announcement" })).toHaveCount(0);
      await expect(
        page.locator("header nav").first().getByRole("link", { name: "Presents" }),
      ).toBeVisible();
      await expect(page.getByRole("contentinfo")).toContainText("Fernwood Test Nursery.");
    }
  });

  test("the phone menu shows the dropdown links, and the new pages pass accessibility checks", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("link", { name: "Presents" })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Gift cards" })).toBeVisible();
    expect(await audit(page), "phone menu").toEqual([]);
    await page.keyboard.press("Escape");
    expect(await audit(page), "home").toEqual([]);
  });

  test("admin screens for the site pass accessibility checks and don't overflow on a phone", async ({
    page,
    request,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);
    for (const [path, heading] of [
      ["/admin/site/header", "Header & announcement"],
      ["/admin/site/footer", "Footer"],
      ["/admin/site/social", "Social links"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      expect(await audit(page), path).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow, `no horizontal scroll on ${path}`).toBe(false);
    }
  });

  test("the API refuses a hostile menu link and an editor without site rights", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);
    const result = await page.evaluate(async () => {
      const { data } = await (await fetch("/api/auth/refresh", { method: "POST" })).json();
      const current = await (
        await fetch("/api/admin/site/chrome", {
          headers: { Authorization: `Bearer ${data.accessToken}` },
        })
      ).json();
      const evil = structuredClone(current.data.draft);
      evil.header.nav[0].href = "javascript:alert(1)";
      const res = await fetch("/api/admin/site/chrome", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.accessToken}`,
        },
        body: JSON.stringify(evil),
      });
      return res.status;
    });
    expect(result).toBe(400);
    const editor = await createAccount(request, baseURL ?? "", "editor", "editor");
    await page.context().clearCookies();
    await signInAdmin(page, editor);
    await page.goto("/admin/site/header");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
  });
});

test.describe("page content", () => {
  test("a section edit stays a draft until published, then shows on the home page", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Let's go green!");

    await page.goto("/admin/site/pages/home");
    await expect(page.getByRole("heading", { level: 1, name: "Home page" })).toBeVisible();
    // The first section starts open.
    await expect(page.getByRole("button", { name: "Hero banner" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.getByLabel("Heading", { exact: true }).first().fill("Grow something wonderful");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();

    // The draft is private.
    expect(await (await request.get("/")).text()).not.toContain("Grow something wonderful");

    await page.getByRole("button", { name: "Publish to website" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();

    await expect
      .poll(async () =>
        (await (await request.get("/")).text()).includes("Grow something wonderful"),
      )
      .toBe(true);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Grow something wonderful");

    // An unsafe link is refused and nothing changes.
    await page.goto("/admin/site/pages/home");
    // The first section starts open.
    await expect(page.getByRole("button", { name: "Hero banner" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page
      .getByLabel("Goes to (/page, #section or https://…)")
      .first()
      .fill("javascript:alert(1)");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Use a web address, a path like /shop")).toBeVisible();
  });
});

test.describe("other pages' content", () => {
  test("editing a content page's heading and FAQ answer reaches the storefront once published", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);

    await page.goto("/admin/site/pages");
    await expect(page.getByRole("link", { name: /Press/ })).toBeVisible();
    await page.goto("/admin/site/pages/press");
    await page.getByLabel("Title", { exact: true }).first().fill("In the news");
    await page.getByRole("button", { name: "Publish to website" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
    await expect
      .poll(async () => (await (await request.get("/press")).text()).includes("In the news"))
      .toBe(true);

    await page.goto("/admin/site/pages/faq");
    await page.getByRole("button", { name: "Questions and answers" }).click();
    await page.getByLabel("Answer 1.2").fill("Yes, to [many countries](/shipping-delivery).");
    await page.getByRole("button", { name: "Publish to website" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
    await expect
      .poll(async () => (await (await request.get("/faq")).text()).includes("Yes, to"), {
        timeout: 30_000,
      })
      .toBe(true);
    const html = await (await request.get("/faq")).text();
    expect(html).toContain('href="/shipping-delivery"');
    expect(html).toContain("Yes, to many countries");
  });
});
