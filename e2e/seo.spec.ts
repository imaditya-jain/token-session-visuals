import { expect, test, type Page } from "@playwright/test";

const jsonLd = async (page: Page) =>
  (await page.locator('script[type="application/ld+json"]').allTextContents()).map(
    (text) => JSON.parse(text) as Record<string, unknown>,
  );

test.describe("what search engines and social cards see", () => {
  test("robots.txt allows the site, hides private areas and links the sitemap", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toMatch(/User-Agent: \*/i);
    expect(text).toMatch(/Allow: \//);
    for (const hidden of ["/api/", "/account", "/login", "/register", "/search"])
      expect(text).toContain(`Disallow: ${hidden}`);
    expect(text).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
  });

  test("sitemap.xml lists public pages, products and collections, and nothing private", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");
    const xml = await response.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    for (const path of [
      "",
      "/shop",
      "/collections",
      "/faq",
      "/about",
      "/collections/house-plants",
      "/products/monstera-deliciosa",
    ])
      expect(urls).toContain(`${baseURL}${path}`);
    expect(urls.filter((u) => /\/(account|login|register|search|api)/.test(u))).toEqual([]);
    expect(urls.length).toBeGreaterThan(30);
    expect(new Set(urls).size).toBe(urls.length);
  });

  test("every URL in the sitemap actually resolves", async ({ request }) => {
    test.setTimeout(180_000);
    const xml = await (await request.get("/sitemap.xml")).text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    const bad: string[] = [];
    for (const url of urls) {
      const response = await request.get(url, { failOnStatusCode: false });
      if (response.status() !== 200) bad.push(`${response.status()} ${url}`);
    }
    expect(bad).toEqual([]);
  });

  test("product pages carry a canonical URL, a social image and Product structured data", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/products/monstera-deliciosa");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${baseURL}/products/monstera-deliciosa`,
    );
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image).toMatch(/^https?:\/\//);

    const product = (await jsonLd(page)).find((d) => d["@type"] === "Product");
    expect(product).toMatchObject({
      name: "Monstera Deliciosa",
      url: `${baseURL}/products/monstera-deliciosa`,
      offers: { priceCurrency: "USD", price: "49.00", availability: "https://schema.org/InStock" },
    });
  });

  test("a sold-out product is reported as out of stock", async ({ page }) => {
    await page.goto("/products/golden-barrel-cactus");
    const product = (await jsonLd(page)).find((d) => d["@type"] === "Product");
    expect(product).toMatchObject({ offers: { availability: "https://schema.org/OutOfStock" } });
  });

  test("the home page describes the organisation and the site search", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/");
    const data = await jsonLd(page);
    expect(data.find((d) => d["@type"] === "Organization")).toMatchObject({
      name: "Fernwood",
      url: baseURL,
    });
    expect(data.find((d) => d["@type"] === "WebSite")).toMatchObject({
      potentialAction: {
        "@type": "SearchAction",
        target: `${baseURL}/search?q={search_term_string}`,
      },
    });
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      "content",
      "Fernwood",
    );
    expect(await page.locator('meta[property="og:image"]').first().getAttribute("content")).toMatch(
      /^https?:\/\//,
    );
  });

  test("private pages stay out of the index", async ({ page }) => {
    for (const path of ["/account", "/login", "/search?q=x", "/reset-password"]) {
      await page.goto(path);
      const robots = await page.locator('meta[name="robots"]').getAttribute("content");
      expect(robots, path).toMatch(/noindex/);
    }
  });
});
