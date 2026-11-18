import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env["BASE_URL"];
const isCI = Boolean(process.env["CI"]);
const port = 3100;

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/__baselines__/{arg}{ext}",
  fullyParallel: true,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: externalBaseUrl ?? `http://localhost:${port}`, trace: "retain-on-failure" },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: "disabled" } },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  // Against a deployed/preview URL (BASE_URL) no local server is started.
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: `npm run build && npm run start -- -p ${port}`,
          url: `http://localhost:${port}`,
          reuseExistingServer: !isCI,
          timeout: 240_000,
        },
      }),
});
