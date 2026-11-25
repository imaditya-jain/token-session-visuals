import { expect, test } from "@playwright/test";

import {
  adminNav as nav,
  audit,
  createAccount,
  PASSWORD,
  randomIp,
  signInAdmin,
  uniqueEmail,
} from "./helpers/admin";
import { latestEmailLink, latestOtpCode } from "./helpers/mailbox";

test.describe("admin access", () => {
  test("anonymous visitors are sent to the admin sign-in, which is never indexed", async ({
    page,
    request,
  }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);

    const response = await request.get("/admin/login");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \/admin/);
  });

  test("a signed-in customer is told they have no admin access", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createAccount(request, baseURL ?? "");
    await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    const since = new Date(Date.now() - 1000);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByLabel("Verification code").fill(await latestOtpCode(email, since));
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "No admin access" })).toBeVisible();
    await expect(nav(page)).toHaveCount(0);
  });

  test("the admin sign-in is password, then code; a wrong code is refused", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText("Incorrect email or password.");

    const since = new Date(Date.now() - 1000);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Verification code")).toBeFocused();
    await expect(page.getByRole("status")).toContainText(email.toLowerCase());

    const code = await latestOtpCode(email, since);
    await page.getByLabel("Verification code").fill(code === "000000" ? "111111" : "000000");
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText(
      "That code is incorrect or has expired.",
    );
    await page.getByLabel("Verification code").fill(code);
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Welcome, Ada" })).toBeVisible();
  });

  test("a non-admin account cannot start an admin sign-in", async ({ page, request, baseURL }) => {
    const email = await createAccount(request, baseURL ?? "");
    await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText("Incorrect email or password.");
  });

  test("the session survives a reload and ends on sign out", async ({ page, request, baseURL }) => {
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);
    await page.reload();
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});

test.describe("admin has its own auth pages", () => {
  test("forgot and reset password stay inside the admin, then lead to the admin sign-in", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
    await page.goto("/admin/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/admin\/forgot-password$/);
    // No storefront chrome on the admin's pages.
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toHaveCount(0);

    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to sign in" })).toHaveCount(0);

    const link = await latestEmailLink("reset-password", email);
    expect(new URL(link).pathname).toBe("/admin/reset-password");
    await page.goto(`${new URL(link).pathname}${new URL(link).search}`);
    await page.getByLabel("New password", { exact: true }).fill("a-brand-new-admin-password");
    await page.getByLabel("Confirm new password").fill("a-brand-new-admin-password");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    const since = new Date(Date.now() - 1000);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("a-brand-new-admin-password");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Verification code").fill(await latestOtpCode(email, since));
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("the customer's pages are unchanged and an admin can't sign in there", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator('form [role="alert"]')).toHaveText(
      "Administrators sign in at /admin/login.",
    );
  });
});

test.describe("permissions in the console", () => {
  test("an editor sees only the dashboard and is refused the Team page", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createAccount(request, baseURL ?? "", "editor", "editor");
    await signInAdmin(page, email);
    await expect(nav(page).getByRole("link")).toHaveText([
      "Dashboard",
      "Posts",
      "Categories & tags",
      "Media",
    ]);
    await expect(nav(page).getByRole("group", { name: "Blog" })).toBeVisible();
    await expect(nav(page).getByRole("group", { name: "Administration" })).toHaveCount(0);
    await expect(page.getByText("Create and edit blog posts")).toBeVisible();

    await page.goto("/admin/users");
    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
    // Even a hand-made request is refused by the API, not just hidden in the UI.
    const refused = await page.evaluate(async () => (await fetch("/api/admin/users")).status);
    expect(refused).toBe(401);
  });

  test("a super admin sees every section", async ({ page, request, baseURL }) => {
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);
    await expect(nav(page).getByRole("link")).toHaveText([
      "Dashboard",
      "Page content",
      "Header & announcement",
      "Footer",
      "Social links",
      "Contact messages",
      "Wholesale applications",
      "Orders",
      "Subscriptions",
      "Products",
      "Inventory",
      "Campaigns",
      "Posts",
      "Categories & tags",
      "Media",
      "Team",
      "Roles",
      "Activity",
    ]);
    // Grouped under their main menus, below the dashboard.
    await expect(nav(page).getByRole("group", { name: "Blog" }).getByRole("link")).toHaveText([
      "Posts",
      "Categories & tags",
      "Media",
    ]);
    await expect(
      nav(page).getByRole("group", { name: "Administration" }).getByRole("link"),
    ).toHaveText(["Team", "Roles", "Activity"]);
  });
});

test.describe("team, roles and activity", () => {
  test("a super admin invites an editor, changes their role, disables them, and it is all logged", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);

    await nav(page).getByRole("link", { name: "Team" }).click();
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
    await page.getByRole("button", { name: "Invite someone" }).click();
    const invitee = uniqueEmail("newbie");
    const form = page.getByRole("form", { name: "Invite an admin" });
    await form.getByLabel("Email").fill(invitee);
    await form.getByLabel("First name").fill("Grace");
    await form.getByLabel("Last name").fill("Hopper");
    await form.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("status").filter({ hasText: invitee })).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: invitee });
    await expect(row.getByText("Invitation not accepted yet")).toBeVisible();

    // The invitation email carries a one-time set-password link.
    expect(await latestEmailLink("admin-invite", invitee)).toContain("/reset-password?token=");

    await expect(row.getByLabel("Role for Grace Hopper")).toHaveValue("editor");
    await row.getByRole("button", { name: /Disable/ }).click();
    await expect(row.getByText("Disabled")).toBeVisible();
    await row.getByRole("button", { name: /Enable/ }).click();
    await expect(row.getByText("Invitation not accepted yet")).toBeVisible();

    await nav(page).getByRole("link", { name: "Activity" }).click();
    await expect(page.getByText("Invited an admin").first()).toBeVisible();
    await expect(page.getByText("Enabled or disabled an admin").first()).toBeVisible();
    await expect(page.getByText("Signed in to the admin").first()).toBeVisible();
  });

  test("a super admin creates, edits and deletes a custom role", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);
    await nav(page).getByRole("link", { name: "Roles" }).click();
    await expect(page.getByRole("heading", { name: "Super Admin" })).toBeVisible();

    await page.getByRole("button", { name: "New role" }).click();
    const create = page.getByRole("region", { name: "New role" });
    await create.getByRole("button", { name: "Create role" }).click();
    await expect(create.getByRole("alert")).toHaveText("Give the role a name.");

    await create.getByLabel("Name").fill("SEO Writer");
    await create.getByLabel("View blog posts").check();
    await create.getByRole("button", { name: "Create role" }).click();
    const card = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: "SEO Writer" }) });
    await expect(card).toBeVisible();
    await expect(card.getByText("View blog posts")).toBeVisible();

    await card.getByRole("button", { name: /Edit/ }).click();
    await page.getByLabel("Create and edit blog posts").check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(card.getByText("Create and edit blog posts")).toBeVisible();

    await card.getByRole("button", { name: /^Delete/ }).click();
    await card.getByRole("button", { name: /Confirm delete/ }).click();
    await expect(page.getByRole("heading", { name: "SEO Writer" })).toHaveCount(0);
  });

  test("built-in roles can't be edited or deleted from the console", async ({
    page,
    request,
    baseURL,
  }) => {
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);
    await page.goto("/admin/roles");
    const builtIn = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: "Editor" }) });
    await expect(builtIn.getByText("Built in")).toBeVisible();
    await expect(builtIn.getByRole("button")).toHaveCount(0);
  });
});

test.describe("the sidebar", () => {
  test("keeps the logo and sign-out in place while only the menu scrolls", async ({
    page,
    request,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);
    await page.goto("/admin/site/footer");
    await expect(page.getByRole("heading", { level: 1, name: "Footer" })).toBeVisible();

    const logo = page.getByRole("link", { name: /^Fernwood\s*Admin$/ }).first();
    const signOut = page.getByRole("button", { name: "Sign out" });
    await expect(logo).toBeInViewport();
    await expect(signOut).toBeInViewport();

    // The page scrolls a long way; the sidebar's logo and sign-out stay exactly where they were.
    const before = await signOut.boundingBox();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(signOut).toBeInViewport();
    expect(await signOut.boundingBox()).toEqual(before);
    await expect(logo).toBeInViewport();

    // On a short screen the menu itself is a scrollable region, so the last entry is still reachable.
    const menu = nav(page).locator("xpath=..");
    expect(await menu.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const last = nav(page).getByRole("link", { name: "Activity" });
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await expect(signOut).toBeInViewport();
  });
});

test.describe("responsive console", () => {
  test("on a phone the sections live in a slide-out menu", async ({ page, request, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
    await signInAdmin(page, email);
    await expect(nav(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Open admin menu" }).click();
    await nav(page).getByRole("link", { name: "Team" }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});

test.describe("accessibility", () => {
  for (const [label, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["mobile", { width: 390, height: 800 }],
  ] as const) {
    test(`every console page has no axe violations (${label})`, async ({
      page,
      request,
      baseURL,
    }) => {
      await page.setViewportSize(viewport);
      await page.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
      await page.goto("/admin/login");
      expect(await audit(page), "admin login").toEqual([]);
      await page.goto("/admin/forgot-password");
      expect(await audit(page), "admin forgot password").toEqual([]);
      await page.goto("/admin/reset-password?token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
      expect(await audit(page), "admin reset password").toEqual([]);
      await page.goto("/admin/login");

      const email = await createAccount(request, baseURL ?? "", "boss", "super_admin");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
      const since = new Date(Date.now() - 1000);
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByLabel("Verification code")).toBeVisible();
      expect(await audit(page), "code screen").toEqual([]);

      await page.getByLabel("Verification code").fill(await latestOtpCode(email, since));
      await page.getByRole("button", { name: "Verify and sign in" }).click();
      await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
      expect(await audit(page), "dashboard").toEqual([]);

      for (const [path, heading] of [
        ["/admin/users", "Team"],
        ["/admin/roles", "Super Admin"],
        ["/admin/activity", "Activity"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
        expect(await audit(page), path).toEqual([]);
      }

      await page.goto("/admin/roles");
      await page.getByRole("button", { name: "New role" }).click();
      expect(await audit(page), "new role form").toEqual([]);
    });
  }
});
