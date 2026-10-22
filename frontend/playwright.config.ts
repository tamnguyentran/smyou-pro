import { defineConfig, devices } from "@playwright/test";

// E2E runs against a production-like build served under the production subpath (ADR-014),
// so any hard-coded "/" in asset, router or API URLs fails here instead of on the server.
const BASE_PATH = "/smyoutask";
const PORT = 4183;

// One dev backend (single uvicorn, CPU-bound argon2) serves every worker; above this it saturates
// and a different test times out on each run (M3-08). Never raise the default without 3 green runs.
const DEFAULT_WORKERS = 2;

function resolveWorkers(raw: string | undefined): number {
  const parsed = Number(raw);
  return raw !== undefined && Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WORKERS;
}

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  workers: resolveWorkers(process.env.E2E_WORKERS),
  forbidOnly: !!process.env.CI,
  // Local full-suite runs hit the same single dev-backend contention CI retries absorb (see
  // DEFAULT_WORKERS comment above): one worker's argon2-bound request can ECONNRESET under load
  // while every other test passes. Retry once locally too so a `make verify` run doesn't fail on
  // infra contention a single isolated rerun already proves is not a code bug.
  retries: 1,
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
