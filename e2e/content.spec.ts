import { expect, test } from "@playwright/test";

const randomIp = () =>
  `198.18.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

test.describe("content pages", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  });

  for (const [path, heading] of [
    ["/about", "Our story"],
    ["/care-guide", "Plant care guide"],
    ["/contact", "Contact us"],
  ] as const) {
    test(`${path} renders with one h1 and no console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      expect(errors).toEqual([]);
    });
  }

  test("policy pages show a neutral notice when the merchant has not published them", async ({
    page,
  }) => {
    await page.goto("/policies/shipping-policy");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shipping & Delivery");
    await expect(page.getByText("This page is being updated")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator("main").getByRole("link", { name: "Contact us" })).toBeVisible();
  });

  test("unknown policy slugs are 404", async ({ request }) => {
    expect((await request.get("/policies/not-a-policy")).status()).toBe(404);
    expect((await request.get("/policies/..%2f..%2fetc")).status()).toBe(404);
  });

  test("footer links reach the new pages", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    for (const [name, url] of [
      ["Our Story", /\/about$/],
      ["Care Library", /\/care-guide$/],
      ["Contact Us", /\/contact$/],
      ["Privacy Policy", /\/policies\/privacy-policy$/],
      ["Plant Guarantee", /\/plant-guarantee$/],
      ["House Plants", /\/collections\/house-plants$/],
    ] as const) {
      await page.goto("/");
      await footer.getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(url);
    }
  });

  test("contact form validates, then sends", async ({ page }) => {
    await page.goto("/contact");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("This field is required").first()).toBeVisible();

    await page.getByLabel("Your name").fill("Ada Lovelace");
    // Unique per run: the form allows 3 messages per address per hour.
    await page.getByLabel("Email", { exact: true }).fill(`ada+${Date.now()}@example.com`);
    await page.getByLabel("Topic").selectOption("Plant care advice");
    await page.getByLabel("Message").fill("hi");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText(/at least 10 characters/)).toBeVisible();

    await page.getByLabel("Message").fill("My fern is turning brown. Any advice please?");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("status")).toContainText("Message sent");
  });
});
