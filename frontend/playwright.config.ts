import { defineConfig, devices } from "@playwright/test";

// E2E runs against a production-like build served under the production subpath (ADR-014),
// so any hard-coded "/" in asset, router or API URLs fails here instead of on the server.
const BASE_PATH = "/smyoutask";
const PORT = 4183;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${String(PORT)}${BASE_PATH}/`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["iPhone 13"] } },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run build && npm run preview",
    env: { BASE_PATH },
    url: `http://localhost:${String(PORT)}${BASE_PATH}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
