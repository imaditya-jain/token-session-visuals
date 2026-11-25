import { expect, test } from "@playwright/test";

import AxeBuilder from "@axe-core/playwright";

import { adminNav, createAccount, randomIp, signInAdmin } from "./helpers/admin";
import { queuedEmails } from "./helpers/mailbox";

test.describe("email campaigns", () => {
  test("write a campaign, pick a design, preview it, test it and see it is safe to send", async ({
    page,
    request,
    baseURL,
  }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
    const boss = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, boss);

    await adminNav(page).getByRole("link", { name: "Campaigns" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Campaigns" })).toBeVisible();
    await page.getByRole("link", { name: "New campaign" }).click();

    await page.getByLabel("Name (only you see this)").fill("November greenhouse note");
    await page.getByLabel("Subject line").fill("Fresh from the greenhouse");
    await page.getByLabel("Heading", { exact: true }).fill("Winter is coming, so are the ferns");
    await page
      .getByLabel("Paragraph 1")
      .fill("We have a new batch of ferns ready for your shelves.");

    // Changing the layout and colours changes the preview the subscribers would get.
    const preview = page.frameLocator('iframe[title="Email preview"]');
    await expect(
      preview.getByRole("heading", { name: "Winter is coming, so are the ferns" }),
    ).toBeVisible();
    const before = await page.locator('iframe[title="Email preview"]').getAttribute("srcdoc");
    await page.getByRole("button", { name: "Feature block" }).click();
    await page.getByRole("button", { name: "Evergreen" }).click();
    await expect
      .poll(async () => page.locator('iframe[title="Email preview"]').getAttribute("srcdoc"))
      .not.toBe(before);
    await expect(page.getByText("Feature block · Evergreen")).toBeVisible();

    await page.getByRole("button", { name: "Create campaign" }).click();
    await expect(page).toHaveURL(/\/admin\/marketing\/campaigns\/[a-f0-9]{24}$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "November greenhouse note" }),
    ).toBeVisible();

    // A test goes to the signed-in admin only.
    await page.getByRole("button", { name: "Send a test to me" }).click();
    await expect(page.getByRole("status").filter({ hasText: boss })).toBeVisible();
    const [test1] = await queuedEmails("campaign", boss);
    expect(test1).toMatchObject({
      subject: "[Test] Fresh from the greenhouse",
      design: "feature.evergreen",
    });

    // Nobody has subscribed in this database, so it can't be sent to an empty audience.
    await expect(page.getByText("There are no confirmed subscribers yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send now" })).toBeDisabled();

    // The sandboxed preview frame is the email itself (not part of the admin UI), so it is left out of the scan.
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .disableRules(["color-contrast"])
      .exclude('iframe[title="Email preview"]')
      .analyze();
    expect(
      violations.map((v) => v.id),
      "campaign editor",
    ).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);

    // The campaign shows in the list, and can be deleted while it is a draft.
    await page.getByRole("link", { name: "All campaigns" }).click();
    await expect(page.getByRole("link", { name: /November greenhouse note/ })).toBeVisible();
    await page.getByRole("link", { name: /November greenhouse note/ }).click();
    await page.getByRole("button", { name: "Delete campaign" }).click();
    await expect(page.getByText("No campaigns here yet.")).toBeVisible();
  });

  test("an invalid campaign is refused with a clear message", async ({
    page,
    request,
    baseURL,
  }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
    const boss = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, boss);
    await page.goto("/admin/marketing/campaigns/new");
    await page.getByLabel("Name (only you see this)").fill("Incomplete");
    await page.getByRole("button", { name: "Create campaign" }).click();
    await expect(page.getByText("Add a subject")).toBeVisible();
  });
});
