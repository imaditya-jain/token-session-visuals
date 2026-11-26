import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env["BASE_URL"];
const isCI = Boolean(process.env["CI"]);
const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/__baselines__/{arg}{ext}",
  // Many tests walk several pages or scan whole pages with axe against a production build; 30 s is too tight for the
  // slower of them when the machine is busy. This is a time budget, not a quality gate: assertions are unchanged.
  timeout: 60_000,
  fullyParallel: true,
  // All tests share one production server and one database. More browsers than this starve it, and slow tests then
  // time out for reasons unrelated to what they check (screenshots, axe scans), so parallelism is capped.
  workers: 2,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: externalBaseUrl ?? `http://localhost:${port}`,
    trace: "retain-on-failure",
    // Every test starts as a visitor who has switched the welcome off; e2e/welcome.spec.ts clears this to test it.
    storageState: {
      cookies: [
        {
          name: "fw_welcome",
          value: "off",
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: "disabled" } },
  projects: [
    { name: "chromium", use: { browserName: "chromium" }, testIgnore: /site-mutation\.spec\.ts/ },
    // Publishes new header/footer content for the WHOLE storefront, so it runs last, after every other test.
    {
      name: "site-mutation",
      use: { browserName: "chromium" },
      testMatch: /site-mutation\.spec\.ts/,
      dependencies: ["chromium"],
    },
  ],
  // Against a deployed/preview URL (BASE_URL) no local server is started.
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: "node scripts/e2e-server.mjs",
          env: { PORT: String(port) },
          url: `http://localhost:${port}`,
          reuseExistingServer: !isCI,
          timeout: 600_000,
        },
      }),
});
