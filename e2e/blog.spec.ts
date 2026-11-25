import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { adminNav, audit, createAccount, signInAdmin } from "./helpers/admin";
import { seedMedia } from "./helpers/mailbox";

const unique = (label: string) =>
  `${label} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

const TEMPLATES = [
  { id: "classic", label: "Classic" },
  { id: "magazine", label: "Magazine" },
  { id: "editorial", label: "Editorial" },
  { id: "visual", label: "Visual" },
  { id: "guide", label: "Guide" },
] as const;

async function admin(page: Page, request: APIRequestContext, baseURL: string | undefined) {
  const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
  await signInAdmin(page, email);
}

const editor = (page: Page) => page.getByRole("textbox", { name: "Post content" });

/** Types into the rich text editor like a person: click, type, and use the toolbar for headings. */
async function write(page: Page, opts: { heading?: string; text: string }) {
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
  if (opts.heading) {
    await page.getByRole("button", { name: "Heading 2" }).click();
    await page.keyboard.type(opts.heading);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type(opts.text);
}

async function newPost(page: Page, title: string) {
  await page.goto("/admin/posts/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
}

const slugOf = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

test.describe("writing and publishing", () => {
  test("a post is written, categorised, tagged, published and appears on the site", async ({
    page,
    request,
    baseURL,
  }) => {
    await admin(page, request, baseURL);
    const category = unique("Plant Care");
    const title = unique("Caring for ferns");

    // A category first (as the owner would from the Categories page).
    await adminNav(page).getByRole("link", { name: "Categories & tags" }).click();
    await page.getByLabel("Name", { exact: true }).first().fill(category);
    await page.getByRole("button", { name: "Add category" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: category })).toBeVisible();

    await newPost(page, title);
    await write(page, { heading: "Watering", text: "Keep the soil lightly moist." });
    await page.getByLabel("Excerpt").fill("How to keep ferns happy indoors.");
    await page.getByLabel(category).check();
    await page.getByLabel("Add tags").fill("Low Light");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /Remove tag Low Light/ })).toBeVisible();
    await page.getByRole("button", { name: "Publish now" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Post published." })).toBeVisible();

    // The post is live at its own address, rendered by the chosen template.
    await page
      .getByRole("link", { name: "View post" })
      .click()
      .catch(() => undefined);
    const slug = slugOf(title);
    await page.goto(`/blog/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Keep the soil lightly moist.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Watering" })).toBeVisible();
    await expect(page.getByRole("link", { name: "#Low Light" })).toBeVisible();
    await expect(page.locator("article[data-template='classic']")).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(`${title} — Fernwood`));

    // And on the journal pages, the feed and the sitemap.
    await page.goto("/blog");
    await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
    await page.goto(`/blog/category/${slugOf(category)}`);
    await expect(page.getByRole("heading", { level: 1, name: category })).toBeVisible();
    await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
    await page.goto("/blog/tag/low-light");
    await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
    expect(await (await request.get("/blog/feed.xml")).text()).toContain(`/blog/${slug}`);
    expect(await (await request.get("/sitemap.xml")).text()).toContain(`/blog/${slug}`);
  });

  test("drafts and scheduled posts stay private until their time", async ({
    page,
    request,
    baseURL,
  }) => {
    await admin(page, request, baseURL);
    const draft = unique("Secret draft");
    await newPost(page, draft);
    await write(page, { text: "Not ready." });
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Draft saved." })).toBeVisible();
    expect((await request.get(`/blog/${slugOf(draft)}`)).status()).toBe(404);

    const later = unique("Coming soon");
    await newPost(page, later);
    await write(page, { text: "Later." });
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    await page
      .getByLabel("Publish later")
      .fill(
        `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T10:00`,
      );
    await page.getByRole("button", { name: "Schedule" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Post scheduled." })).toBeVisible();
    await expect(page.getByText(/Scheduled for/)).toBeVisible();
    expect((await request.get(`/blog/${slugOf(later)}`)).status()).toBe(404);
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain(slugOf(later));
  });

  test("scheduling needs a future time and a title is required", async ({
    page,
    request,
    baseURL,
  }) => {
    await admin(page, request, baseURL);
    await page.goto("/admin/posts/new");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Give the post a title." }),
    ).toBeVisible();
    await page.getByLabel("Title", { exact: true }).fill(unique("Past"));
    await page.getByLabel("Publish later").fill("2001-01-01T10:00");
    await page.getByRole("button", { name: "Schedule" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "future" })).toBeVisible();
  });

  test("changing a published post's address keeps the old link working with a permanent redirect", async ({
    page,
    request,
    baseURL,
  }) => {
    await admin(page, request, baseURL);
    const title = unique("Old name");
    await newPost(page, title);
    await write(page, { text: "Body." });
    await page.getByRole("button", { name: "Publish now" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Post published." })).toBeVisible();
    const oldSlug = slugOf(title);
    expect((await request.get(`/blog/${oldSlug}`)).status()).toBe(200);

    const newSlug = `${oldSlug}-renamed`;
    await page.getByLabel("Slug").fill(newSlug);
    await expect(page.getByText("The old address will keep working")).toBeVisible();
    await page.getByRole("button", { name: "Update" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Post published." })).toBeVisible();

    expect((await request.get(`/blog/${newSlug}`)).status()).toBe(200);
    const redirect = await request.get(`/blog/${oldSlug}`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(308);
    expect(redirect.headers()["location"]).toContain(`/blog/${newSlug}`);
  });

  test("a slug that is taken or reserved is refused with a clear message", async ({
    page,
    request,
    baseURL,
  }) => {
    await admin(page, request, baseURL);
    await newPost(page, unique("Reserved"));
    await page.getByLabel("Slug").fill("feed");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "reserved for the blog" }),
    ).toBeVisible();
  });

  test("moving to trash hides a post at once; it can be restored as a draft and deleted for good", async ({
    page,
    request,
    baseURL,
  }) => {
    await admin(page, request, baseURL);
    const title = unique("Short lived");
    await newPost(page, title);
    await write(page, { text: "Soon gone." });
    await page.getByRole("button", { name: "Publish now" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Post published." })).toBeVisible();
    expect((await request.get(`/blog/${slugOf(title)}`)).status()).toBe(200);

    await page.goto("/admin/posts");
    const row = () => page.getByRole("listitem").filter({ hasText: title });
    await row().getByRole("button", { name: /Trash/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "1 post updated." })).toBeVisible();
    expect((await request.get(`/blog/${slugOf(title)}`)).status()).toBe(404);

    const statusTabs = page.getByRole("navigation", { name: "Post status" });
    await statusTabs.getByRole("button", { name: /^Trash/ }).click();
    await expect(row()).toBeVisible();
    await row()
      .getByRole("button", { name: /Restore/ })
      .click();
    await statusTabs.getByRole("button", { name: /^Drafts/ }).click();
    await expect(row().getByText(/Draft/)).toBeVisible();
    expect((await request.get(`/blog/${slugOf(title)}`)).status()).toBe(404);

    await row().getByRole("button", { name: /Trash/ }).click();
    await statusTabs.getByRole("button", { name: /^Trash/ }).click();
    await row()
      .getByRole("button", { name: /Delete permanently/ })
      .click();
    await row()
      .getByRole("button", { name: /Confirm delete/ })
      .click();
    await expect(row()).toHaveCount(0);
  });
});

test.describe("the five page templates", () => {
  test("each template renders its own layout on the live site", async ({
    page,
    request,
    baseURL,
  }) => {
    await admin(page, request, baseURL);
    const slugs: Record<string, string> = {};
    for (const template of TEMPLATES) {
      const title = unique(`${template.label} layout`);
      slugs[template.id] = slugOf(title);
      await newPost(page, title);
      await write(page, { heading: "Light", text: "Bright, indirect light." });
      await page.getByLabel("Excerpt").fill("A short summary.");
      await page.getByText(template.label, { exact: true }).first().click();
      await expect(page.getByRole("radio", { name: new RegExp(template.label) })).toBeChecked();
      await page.getByRole("button", { name: "Publish now" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Post published." })).toBeVisible();
    }

    for (const template of TEMPLATES) {
      await page.goto(`/blog/${slugs[template.id]}`);
      const article = page.locator(`article[data-template='${template.id}']`);
      await expect(article).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("main")).toHaveCount(1);
      if (template.id === "guide") {
        await expect(page.getByRole("navigation", { name: "Table of contents" })).toBeAttached();
        await expect(page.getByRole("heading", { name: "Plants to try" })).toBeVisible();
      }
      if (template.id === "magazine") {
        await expect(page.getByRole("complementary", { name: "About this post" })).toBeVisible();
      }
    }
  });
});

test.describe("safety", () => {
  test("markup typed into a post is shown as text, never run", async ({
    page,
    request,
    baseURL,
  }) => {
    await admin(page, request, baseURL);
    const title = unique("Markup test");
    await newPost(page, title);
    await write(page, {
      text: "<script>window.__pwned = true</script> <img src=x onerror=alert(1)>",
    });
    await page.getByRole("button", { name: "Publish now" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Post published." })).toBeVisible();

    await page.goto(`/blog/${slugOf(title)}`);
    await expect(page.getByText("<script>window.__pwned = true</script>")).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned),
    ).toBeUndefined();
    await expect(page.locator("article img[src='x']")).toHaveCount(0);
  });

  test("the admin API refuses a hostile document with a clear error", async ({
    page,
    request,
    baseURL,
  }) => {
    await admin(page, request, baseURL);
    const result = await page.evaluate(async () => {
      const refresh = await (await fetch("/api/auth/refresh", { method: "POST" })).json();
      const response = await fetch("/api/admin/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${refresh.data.accessToken}`,
        },
        body: JSON.stringify({
          title: "Hostile",
          content: {
            type: "doc",
            content: [{ type: "image", attrs: { src: "https://evil.example/x.png" } }],
          },
          template: "classic",
          status: "draft",
        }),
      });
      return { status: response.status, body: await response.json() };
    });
    expect(result.status).toBe(400);
    expect(JSON.stringify(result.body)).toContain("source that isn't allowed");
  });
});

test.describe("media", () => {
  test("an image from the library can be set as the featured image and shows on the post", async ({
    page,
    request,
    baseURL,
  }) => {
    await admin(page, request, baseURL);
    const url = `https://cdn.shopify.com/s/files/1/0001/e2e-${Date.now()}.png`;
    await seedMedia(url, {
      filename: "fern-photo.png",
      alt: "A fern on a shelf",
      width: 800,
      height: 600,
    });
    const title = unique("With picture");
    await newPost(page, title);
    await write(page, { text: "Pretty." });
    await page.getByRole("button", { name: "Set featured image" }).click();
    await page
      .getByRole("button", { name: /Use fern-photo\.png/ })
      .first()
      .click();
    await expect(page.getByLabel("Alternative text")).toHaveValue("A fern on a shelf");
    await page.getByRole("button", { name: "Publish now" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Post published." })).toBeVisible();

    await page.goto(`/blog/${slugOf(title)}`);
    const hero = page.locator("article img").first();
    await expect(hero).toHaveAttribute("alt", "A fern on a shelf");
    // Pictures are served through the app's own optimiser, never straight from the CDN.
    expect(await hero.getAttribute("src")).toContain("/_next/image");
    await expect(page.locator("meta[property='og:image']")).toHaveAttribute("content", url);
  });

  test("uploading while Shopify is unavailable explains it instead of failing silently", async ({
    page,
    request,
    baseURL,
  }) => {
    await admin(page, request, baseURL);
    await adminNav(page).getByRole("link", { name: "Media library" }).click();
    await page.getByLabel("Upload an image").setInputFiles({
      name: "tiny.png",
      mimeType: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    });
    await expect(
      page.getByRole("alert").filter({ hasText: "Media storage is unavailable" }),
    ).toBeVisible();
  });

  test("files that aren't images are refused", async ({ page, request, baseURL }) => {
    await admin(page, request, baseURL);
    await page.goto("/admin/media");
    await page.getByLabel("Upload an image").setInputFiles({
      name: "evil.png",
      mimeType: "image/png",
      buffer: Buffer.from("<script>alert(1)</script>"),
    });
    await expect(
      page.getByRole("alert").filter({ hasText: "Upload a JPEG, PNG, WebP or GIF image." }),
    ).toBeVisible();
  });
});

test.describe("accessibility and responsiveness", () => {
  for (const [label, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["mobile", { width: 390, height: 800 }],
  ] as const) {
    test(`the journal and every template have no axe violations (${label})`, async ({
      page,
      request,
      baseURL,
    }) => {
      await page.setViewportSize(viewport);
      await admin(page, request, baseURL);
      const slugs: string[] = [];
      for (const template of TEMPLATES) {
        const title = unique(`A11y ${template.label}`);
        slugs.push(slugOf(title));
        await newPost(page, title);
        await write(page, { heading: "Light", text: "Bright, indirect light." });
        await page.getByText(template.label, { exact: true }).first().click();
        await page.getByRole("button", { name: "Publish now" }).click();
        await expect(page.getByRole("status").filter({ hasText: "Post published." })).toBeVisible();
      }
      for (const slug of slugs) {
        await page.goto(`/blog/${slug}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await audit(page), `/blog/${slug}`).toEqual([]);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow, `no horizontal scroll on /blog/${slug}`).toBe(false);
      }
      for (const path of ["/blog", "/blog/page/99"]) {
        const response = await page.goto(path);
        if (response?.status() === 404) continue;
        expect(await audit(page), path).toEqual([]);
      }
    });

    test(`the admin blog screens have no axe violations (${label})`, async ({
      page,
      request,
      baseURL,
    }) => {
      await page.setViewportSize(viewport);
      await admin(page, request, baseURL);
      for (const [path, heading] of [
        ["/admin/posts", "Posts"],
        ["/admin/categories", "Categories and tags"],
        ["/admin/media", "Media library"],
        ["/admin/posts/new", "New post"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        if (path === "/admin/posts/new") await expect(editor(page)).toBeVisible();
        expect(await audit(page), path).toEqual([]);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow, `no horizontal scroll on ${path}`).toBe(false);
      }
    });
  }

  test("public pages for missing posts, categories and pages answer 404", async ({ request }) => {
    for (const path of [
      "/blog/does-not-exist",
      "/blog/category/nope",
      "/blog/tag/nope",
      "/blog/page/abc",
    ]) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
    expect((await request.get("/blog/page/1", { maxRedirects: 0 })).status()).toBe(308);
  });
});
