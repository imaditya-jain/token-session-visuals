import { expect, test } from "@playwright/test";

import { adminNav, createAccount, randomIp, signInAdmin } from "./helpers/admin";
import { seedMedia } from "./helpers/mailbox";

const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

/**
 * The central library. Shopify is switched off in the e2e server, so uploads, replacing and deleting are refused
 * with a clear message; everything stored locally (folders, filing, search, usage) is exercised for real.
 */
test.describe("media library", () => {
  test("folders, filing, search and where a picture is used", async ({
    page,
    request,
    baseURL,
  }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
    const boss = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, boss);

    const id = stamp();
    const fern = `fern-${id}.png`;
    const pot = `pot-${id}.png`;
    const fernUrl = `https://cdn.shopify.com/s/files/1/0001/${fern}?v=1`;
    await seedMedia(fernUrl, { filename: fern, alt: "A fern" });
    await seedMedia(`https://cdn.shopify.com/s/files/1/0001/${pot}?v=1`, {
      filename: pot,
      alt: "A pot",
    });

    await adminNav(page).getByRole("link", { name: "Media library" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Media library" })).toBeVisible();

    // Search by file name.
    await page.getByLabel("Search by file name or description").first().fill(`fern-${id}`);
    await page.getByRole("button", { name: "Search" }).first().click();
    await expect(page.getByRole("button", { name: new RegExp(fern) })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(pot) })).toHaveCount(0);
    await page.getByLabel("Search by file name or description").first().fill("");
    await page.getByRole("button", { name: "Search" }).first().click();

    // Make a folder and file the fern in it.
    const folder = `Journal ${id}`;
    await page.getByLabel("New folder").fill(folder);
    await page.getByRole("button", { name: "Create folder" }).click();
    await expect(
      page.getByLabel("Folder", { exact: true }).first().locator("option", { hasText: folder }),
    ).toHaveCount(1);
    await page.getByRole("checkbox", { name: `Select ${fern}` }).check();
    await expect(page.getByRole("region", { name: "Selected images" })).toContainText("1 selected");
    await page.getByLabel("Move to").selectOption({ label: folder });
    await page
      .getByLabel("Folder", { exact: true })
      .first()
      .selectOption({ label: `${folder} (1)` });
    await expect(page.getByRole("button", { name: new RegExp(fern) })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(pot) })).toHaveCount(0);

    // Folders can be renamed; deleting one keeps its pictures.
    await page.getByRole("button", { name: "Rename folder" }).click();
    await page.getByLabel("Folder name").fill(`Gallery ${id}`);
    await page.getByRole("button", { name: "Save name" }).click();
    await page.getByRole("button", { name: /Delete folder/ }).click();
    await page.getByLabel("Folder", { exact: true }).first().selectOption("all");
    await expect(page.getByRole("button", { name: new RegExp(fern) })).toBeVisible();

    // Not used anywhere yet: both show in "Not used".
    await page.getByRole("tab", { name: "Not used" }).click();
    await expect(page.getByRole("button", { name: new RegExp(fern) })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(pot) })).toBeVisible();
    await page.getByRole("tab", { name: "Everything" }).click();

    // Use the fern as a post's featured image: the library then says where it is used and refuses to delete it.
    const title = `With fern ${id}`;
    await page.goto("/admin/posts/new");
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByRole("button", { name: "Set featured image" }).click();
    await page
      .getByRole("button", { name: new RegExp(`Use ${fern}`) })
      .first()
      .click();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByRole("status").filter({ hasText: /saved/i })).toBeVisible();

    await page.goto("/admin/media");
    await expect(page.getByRole("button", { name: new RegExp(fern) })).toContainText("Used in 1");
    await page.getByRole("button", { name: new RegExp(fern) }).click();
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await expect(page.getByText(/This image is used in/)).toBeVisible();
  });

  test("replacing or deleting without Shopify is refused plainly", async ({
    page,
    request,
    baseURL,
  }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
    const boss = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, boss);
    const name = `solo-${stamp()}.png`;
    await seedMedia(`https://cdn.shopify.com/s/files/1/0001/${name}?v=1`, {
      filename: name,
      alt: "",
    });
    await page.goto("/admin/media");
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await expect(page.getByText("Nowhere. It is safe to delete.")).toBeVisible();
    await page.getByLabel("Replace picture").setInputFiles({
      name: "new.png",
      mimeType: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
    });
    await expect(
      page.getByRole("alert").filter({ hasText: "Media storage is unavailable" }),
    ).toBeVisible();
  });
});
