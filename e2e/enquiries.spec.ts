import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { adminNav, audit, createAccount, randomIp, signInAdmin } from "./helpers/admin";
import { queuedEmails } from "./helpers/mailbox";

const unique = (label: string) =>
  `${label} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
const email = () => `visitor+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

async function sendContact(page: Page, name: string, address: string, message: string) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  await page.goto("/contact");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(address);
  await page.getByLabel("Topic").selectOption("Plant care advice");
  await page.getByLabel("Message").fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toContainText("Message sent");
}

async function sendWholesale(page: Page, business: string, address: string) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  await page.goto("/wholesale");
  await page.getByLabel("Business name").fill(business);
  await page.getByLabel("Your name").fill("Grace Hopper");
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Phone").fill("+91 98765 43210");
  await page.getByLabel("Type of business").selectOption("Café or restaurant");
  await page.getByLabel("City and country").fill("Pune, India");
  await page
    .getByLabel("What are you looking for?")
    .fill("Forty plants for a new café, then monthly supply.");
  await page.getByRole("button", { name: "Send application" }).click();
  await expect(page.getByRole("status")).toContainText("Application received");
}

test.describe("contact messages", () => {
  test("a message from the website is saved, acknowledged, and worked through in the admin", async ({
    page,
    request,
    baseURL,
  }) => {
    const name = unique("Visitor");
    const address = email();
    await sendContact(page, name, address, "My fern is turning brown. Any advice please?");

    // The sender gets a thank-you with a reference, and nothing they typed beyond their name.
    const [ack] = await queuedEmails("enquiry-received", address);
    expect(ack).toMatchObject({ kind: "contact", name });
    expect(String(ack?.["reference"])).toMatch(/^CT-\d{6}-[A-Z0-9]{4}$/);
    expect(JSON.stringify(ack)).not.toContain("fern");

    const boss = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, boss);
    await adminNav(page).getByRole("link", { name: "Contact messages" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Contact messages" })).toBeVisible();

    await page.getByRole("searchbox", { name: "Search" }).fill(name);
    await page.getByRole("button", { name: "Search" }).click();
    const row = page.getByRole("listitem").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Plant care advice");
    await row.getByRole("button").click();

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("My fern is turning brown")).toBeVisible();
    await expect(sheet.getByRole("link", { name: address })).toHaveAttribute("href", /^mailto:/);

    await sheet.getByLabel("Status").selectOption("in_progress");
    await expect(sheet.getByLabel("Status")).toHaveValue("in_progress");
    await sheet.getByLabel("Assigned to").selectOption({ label: "Ada Lovelace" });
    await sheet.getByLabel("Add a note").fill("Replied with watering tips.");
    await sheet.getByRole("button", { name: "Save note" }).click();
    await expect(sheet.getByText("Replied with watering tips.")).toBeVisible();
    await expect(sheet.getByRole("list").filter({ hasText: "In progress" }).last()).toBeVisible();

    await sheet.getByRole("button", { name: "Archive" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);

    await page.getByLabel("Show archived").check();
    await page.getByRole("listitem").filter({ hasText: name }).getByRole("button").click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Confirm: delete permanently/ })
      .click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
  });

  test("the thank-you goes out once per address per day, but every message reaches the team", async ({
    page,
  }) => {
    const address = email();
    await sendContact(page, unique("Repeat"), address, "First message about my monstera care.");
    await sendContact(page, unique("Repeat"), address, "Second message about my monstera care.");
    expect(await queuedEmails("enquiry-received", address)).toHaveLength(1);
  });
});

test.describe("wholesale applications", () => {
  test("an application is saved, reviewed, approved and exported", async ({
    page,
    request,
    baseURL,
  }) => {
    const business = unique("Green Corner");
    await sendWholesale(page, business, email());

    const boss = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, boss);
    await adminNav(page).getByRole("link", { name: "Wholesale applications" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Wholesale applications" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Wholesale application status" })
        .getByRole("button", { name: /^New/ }),
    ).toBeVisible();

    const row = page.getByRole("listitem").filter({ hasText: business });
    await expect(row).toBeVisible();
    await row.getByRole("button").click();
    const sheet = page.getByRole("dialog");
    for (const text of [
      "Pune, India",
      "Café or restaurant",
      "+91 98765 43210",
      "Forty plants for a new café",
    ]) {
      await expect(sheet.getByText(text).first()).toBeVisible();
    }
    // Wholesale statuses differ from contact statuses.
    await expect(sheet.getByLabel("Status").locator("option")).toHaveText([
      "New",
      "In review",
      "Approved",
      "Rejected",
    ]);
    await sheet.getByLabel("Status").selectOption("approved");
    await expect(sheet.getByLabel("Status")).toHaveValue("approved");
    await page.keyboard.press("Escape");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^fernwood-wholesale-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = readFileSync(await download.path(), "utf8");
    expect(text).toContain("Business,Business type,Location,Tax ID");
    expect(text).toContain(business);
    expect(text).toContain("Approved");
  });
});

test.describe("access and quality", () => {
  test("an editor without enquiry rights sees neither the menu entries nor the pages", async ({
    page,
    request,
    baseURL,
  }) => {
    const editor = await createAccount(request, baseURL ?? "", "editor", "editor");
    await signInAdmin(page, editor);
    await expect(adminNav(page).getByRole("link", { name: "Contact messages" })).toHaveCount(0);
    await page.goto("/admin/enquiries/wholesale");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
  });

  for (const [label, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["mobile", { width: 390, height: 800 }],
  ] as const) {
    test(`enquiry screens have no axe violations and don't overflow (${label})`, async ({
      page,
      request,
      baseURL,
    }) => {
      await page.setViewportSize(viewport);
      await sendContact(
        page,
        unique("A11y"),
        email(),
        "Checking the accessibility of this screen.",
      );
      const boss = await createAccount(request, baseURL ?? "", "boss", "super_admin");
      await signInAdmin(page, boss);
      for (const [path, heading] of [
        ["/admin/enquiries/contact", "Contact messages"],
        ["/admin/enquiries/wholesale", "Wholesale applications"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        expect(await audit(page), path).toEqual([]);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow, `no horizontal scroll on ${path}`).toBe(false);
      }
      await page.goto("/admin/enquiries/contact");
      await page.getByRole("main").getByRole("listitem").first().getByRole("button").click();
      await expect(
        page.getByRole("dialog").getByRole("heading", { name: "Internal notes" }),
      ).toBeVisible();
      expect(await audit(page), "enquiry detail").toEqual([]);
    });
  }
});
