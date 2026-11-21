import { expect, test } from "@playwright/test";

const randomIp = () =>
  `198.51.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

/** Social icons have no public profile URLs yet; they are the only links allowed to be placeholders. */
const SOCIAL = new Set(["Instagram", "Facebook", "Twitter", "YouTube"]);

const PAGES = [
  "/",
  "/shop",
  "/collections",
  "/collections/house-plants",
  "/products/monstera-deliciosa",
  "/about",
  "/care-guide",
  "/faq",
  "/contact",
  "/gift-cards",
  "/careers",
  "/wholesale",
  "/gardener-services",
  "/order-confirmed",
  "/sustainability",
  "/press",
  "/accessibility",
  "/shipping-delivery",
  "/plant-guarantee",
  "/policies/privacy-policy",
  "/login",
  "/register",
  "/account",
  "/search?q=plant",
];

test.describe("every link goes somewhere real", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  });

  test("no placeholders, no dead anchors, no 404s on any page", async ({ page, request }) => {
    test.setTimeout(240_000); // visits every page once
    const problems: string[] = [];
    const internal = new Map<string, string>();

    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const links = await page.$$eval("a[href]", (anchors) =>
        anchors.map((a) => ({
          href: a.getAttribute("href") ?? "",
          label: (a.getAttribute("aria-label") ?? a.textContent ?? "").trim().replace(/\s+/g, " "),
        })),
      );

      for (const { href, label } of links) {
        if (href === "" || href === "#") problems.push(`${path}: empty link "${label}"`);
        else if (href.startsWith("#")) {
          if (SOCIAL.has(label)) continue;
          const exists = await page.locator(`[id="${href.slice(1)}"]`).count();
          if (!exists) problems.push(`${path}: "${label}" → ${href} has no target on this page`);
          else if (href === "#footer")
            problems.push(`${path}: "${label}" is a #footer placeholder`);
        } else if (href.startsWith("/")) internal.set(href, `${path} "${label}"`);
        else if (href.startsWith("http") && !href.includes("localhost"))
          problems.push(`${path}: unexpected external link ${href}`);
        else if (!/^(mailto:|tel:)/.test(href) && !href.startsWith("http"))
          problems.push(`${path}: unusual link ${href}`);
      }
    }

    for (const [href, where] of internal) {
      const response = await request.get(href, { failOnStatusCode: false });
      if (response.status() !== 200) problems.push(`${response.status()} ${href} (from ${where})`);
    }

    expect(problems).toEqual([]);
  });

  test("header and footer destinations are the real pages", async ({ page }) => {
    await page.goto("/about");
    const nav = page.getByRole("banner").getByRole("navigation");
    await expect(nav.getByRole("link", { name: "Collections" })).toHaveAttribute(
      "href",
      "/collections",
    );
    await expect(nav.getByRole("link", { name: "Our Story" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "About us" })).toHaveAttribute("href", "/about");

    const footer = page.locator("footer");
    const expected: Record<string, string> = {
      "Gift Cards": "/gift-cards",
      Wholesale: "/wholesale",
      "Gardener Services": "/gardener-services",
      "Shipping & Delivery": "/shipping-delivery",
      "Plant Guarantee": "/plant-guarantee",
      "Care Library": "/care-guide",
      FAQs: "/faq",
      "Contact Us": "/contact",
      Accessibility: "/accessibility",
      "Privacy Policy": "/policies/privacy-policy",
      "Terms of Service": "/policies/terms-of-service",
    };
    for (const [name, href] of Object.entries(expected))
      await expect(footer.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    await expect(footer.getByRole("link", { name: "hello@fernwood.shop" })).toHaveAttribute(
      "href",
      "mailto:hello@fernwood.shop",
    );
    await expect(footer.getByRole("link", { name: "(503) 555-0142" })).toHaveAttribute(
      "href",
      "tel:+15035550142",
    );
  });

  test("header Collections link works from a non-home page", async ({ page }) => {
    await page.goto("/contact");
    await page
      .getByRole("banner")
      .getByRole("navigation")
      .getByRole("link", { name: "Collections" })
      .click();
    await expect(page).toHaveURL(/\/collections$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Collections");
    await expect(page.getByRole("link", { name: /House Plants/ }).first()).toBeVisible();
  });
});

test.describe("new pages", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  });

  for (const [path, title] of [
    ["/collections", "Collections"],
    ["/faq", "Frequently asked questions"],
    ["/gift-cards", "Gift cards"],
    ["/careers", "Careers"],
    ["/wholesale", "Wholesale"],
    ["/gardener-services", "Gardener services"],
    ["/sustainability", "Sustainability"],
    ["/press", "Press"],
    ["/accessibility", "Accessibility"],
    ["/shipping-delivery", "Shipping & delivery"],
    ["/plant-guarantee", "Plant guarantee"],
  ] as const) {
    test(`${path} renders with the shared banner and no console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.locator("main, section").first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("every content page opens with the same banner as the shop", async ({ page }) => {
    for (const path of ["/shop", "/login", "/register", "/account", "/contact", "/about", "/faq"]) {
      await page.goto(path);
      await expect(page.locator('section img[src*="seasonal-greenhouse"]').first()).toBeVisible();
    }
  });

  test("shipping page states the rates configured in Shopify", async ({ page }) => {
    await page.goto("/shipping-delivery");
    const table = page.getByRole("table");
    await expect(table).toContainText("$8");
    await expect(table).toContainText("$15");
    await expect(table).toContainText("$30");
    await expect(table).toContainText("Free on orders over $70");
  });

  test("FAQ answers open and close, and publish structured data", async ({ page }) => {
    await page.goto("/faq");
    const question = page.getByText("How much does shipping cost?");
    await question.click();
    await expect(page.getByText(/Standard shipping is \$8/).first()).toBeVisible();
    const json = await page.locator('script[type="application/ld+json"]').textContent();
    expect(JSON.parse(json ?? "{}")["@type"]).toBe("FAQPage");
  });

  test("links into the contact form preselect the topic", async ({ page }) => {
    await page.goto("/careers");
    await page.getByRole("link", { name: "Get in touch" }).click();
    await expect(page.getByLabel("Topic")).toHaveValue("Careers");
    await page.goto("/contact?topic=Bogus%20Topic");
    await expect(page.getByLabel("Topic")).toHaveValue("Order or delivery");
  });

  test("gift cards page degrades to a notice when none are published", async ({ page }) => {
    await page.goto("/gift-cards");
    await expect(page.getByText("Gift cards are coming soon")).toBeVisible();
  });
});
