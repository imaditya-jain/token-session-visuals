import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const audit = async (page: Page): Promise<string[]> =>
  (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .disableRules(["color-contrast"])
      .analyze()
  ).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);

const cards = (page: Page) =>
  page.getByRole("list", { name: "Your best matches" }).getByRole("article");

async function toSwipe(page: Page, opts: { light?: string; size?: string; budget?: string } = {}) {
  await page.goto("/plant-finder");
  await page.getByRole("button", { name: "Let's go" }).click();
  await expect(
    page.getByRole("heading", { name: "How much light does your space get?" }),
  ).toBeFocused();
  if (opts.light) await page.getByLabel("Light in your space").fill(opts.light);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByText(opts.size ?? "On a table or sideboard").click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByText(opts.budget ?? "No limit").click();
  await page.getByRole("button", { name: "Show me plants" }).click();
  await expect(page.getByText(/^Plant 1 of \d+$/)).toBeVisible();
}

async function swipeAll(page: Page, verdict: "Like" | "Pass" | "alternate") {
  const total = Number(
    /of (\d+)/.exec((await page.getByText(/^Plant \d+ of \d+$/).textContent()) ?? "")?.[1],
  );
  for (let i = 0; i < total; i++) {
    const like = verdict === "Like" || (verdict === "alternate" && i % 2 === 0);
    await page.getByRole("button", { name: like ? /^Like / : /^Pass on / }).click();
    // A card takes a moment to fly off; wait for the next one like a person would.
    if (i < total - 1) await expect(page.getByText(`Plant ${i + 2} of ${total}`)).toBeVisible();
  }
}

test.describe("Plant Finder", () => {
  test("from the first question to the matches, then start again", async ({ page }) => {
    await toSwipe(page, { light: "3", size: "On a shelf or desk", budget: "Up to $50" });
    await swipeAll(page, "alternate");

    await expect(page.getByRole("heading", { name: "Your best matches" })).toBeFocused();
    await expect(page.getByText("The Sun Seeker")).toBeVisible();
    await expect(cards(page)).toHaveCount(3);
    // Every reason shown comes from the product's own details, and the best match always has at least one.
    const reasons = page.getByRole("list", { name: /^Why .* suits you$/ });
    expect(await reasons.count()).toBeGreaterThan(0);
    await expect(reasons.first().getByRole("listitem").first()).toBeVisible();

    await page.getByRole("button", { name: "Start again" }).click();
    await expect(page.getByRole("button", { name: "Let's go" })).toBeVisible();
  });

  test("the light slider shows what each setting means, and answers the keyboard", async ({
    page,
  }) => {
    await page.goto("/plant-finder");
    await page.getByRole("button", { name: "Let's go" }).click();
    const slider = page.getByLabel("Light in your space");
    await expect(page.getByText("Some daylight", { exact: true })).toBeVisible();
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("A bright window", { exact: true })).toBeVisible();
    await page.keyboard.press("Home");
    await expect(page.getByText("A dim corner", { exact: true })).toBeVisible();
    await expect(slider).toHaveAttribute("aria-valuetext", "A dim corner");
  });

  test("next stays off until a choice is made", async ({ page }) => {
    await page.goto("/plant-finder");
    await page.getByRole("button", { name: "Let's go" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
    await page.getByText("On the floor").click();
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  test("a card can be dragged away to like it, and a short drag springs back", async ({ page }) => {
    await toSwipe(page);
    const deck = page.getByRole("group", { name: "Plants to like or pass" });
    const box = (await deck.boundingBox())!;
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // A short drag does nothing.
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.move(middle.x + 30, middle.y, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByText(/^Plant 1 of \d+$/)).toBeVisible();

    // A long drag to the right likes the plant; to the left passes it.
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.move(middle.x + 220, middle.y + 10, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText(/^Plant 2 of \d+$/)).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /^Liked / })).toBeAttached();

    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.move(middle.x - 220, middle.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText(/^Plant 3 of \d+$/)).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /^Passed on / })).toBeAttached();
  });

  test("the arrow keys decide and Backspace goes back", async ({ page }) => {
    await toSwipe(page);
    await page.getByRole("group", { name: "Plants to like or pass" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(/^Plant 2 of \d+$/)).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByText(/^Plant 3 of \d+$/)).toBeVisible();
    await page.keyboard.press("Backspace");
    await expect(page.getByText(/^Plant 2 of \d+$/)).toBeVisible();
    await page.getByRole("button", { name: "Go back one plant" }).click();
    await expect(page.getByText(/^Plant 1 of \d+$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Go back one plant" })).toBeDisabled();
  });

  test("with reduced motion every control still works", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await toSwipe(page);
    await page.getByRole("button", { name: /^Like / }).click();
    await expect(page.getByText(/^Plant 2 of \d+$/)).toBeVisible();
  });

  test("the result is remembered for the tab and can be cleared", async ({ page }) => {
    await toSwipe(page);
    await swipeAll(page, "Like");
    await expect(page.getByRole("heading", { name: "Your best matches" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your best matches" })).toBeVisible();
    await expect(cards(page)).toHaveCount(3);
    await page.getByRole("button", { name: "Start again" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: "Let's go" })).toBeVisible();
  });

  test("the home page invites people to it", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Swipe your way to it/ })).toBeVisible();
    await page.getByRole("link", { name: "Find my plant" }).first().click();
    await expect(page).toHaveURL(/\/plant-finder$/);
  });

  for (const [label, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["phone", { width: 390, height: 800 }],
  ] as const) {
    test(`every screen is accessible and fits the screen (${label})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const fits = async (name: string) => {
        expect(await audit(page), name).toEqual([]);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow, `${name} overflows`).toBe(false);
      };
      await page.goto("/plant-finder");
      await fits("start");
      await page.getByRole("button", { name: "Let's go" }).click();
      await fits("light");
      await page.getByRole("button", { name: "Next" }).click();
      await fits("size");
      await page.getByText("On a table or sideboard").click();
      await page.getByRole("button", { name: "Next" }).click();
      await fits("budget");
      await page.getByText("No limit").click();
      await page.getByRole("button", { name: "Show me plants" }).click();
      await fits("swipe");
      await swipeAll(page, "alternate");
      await expect(page.getByRole("heading", { name: "Your best matches" })).toBeVisible();
      await fits("result");
    });
  }
});
