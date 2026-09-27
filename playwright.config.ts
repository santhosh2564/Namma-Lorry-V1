import { defineConfig, devices } from "@playwright/test";

/**
 * Console end-to-end config (M7).
 *
 * The console is a web app, so the specs drive the same Expo web build an
 * operator uses — not a separate harness. `E2E_BASE_URL` points the run at an
 * already-running preview; otherwise the config starts one itself.
 *
 * The spec needs a real Supabase project and an admin account. Without them it
 * skips with a reason rather than failing, so a clone with no credentials still
 * has a green suite instead of a red one it cannot fix.
 */
const PORT = Number(process.env.E2E_PORT ?? 8081);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // A Mappls call and a Supabase round trip are slower than a local assert.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "console", use: { ...devices["Desktop Chrome"] } }],
  webServer:
    process.env.E2E_BASE_URL === undefined
      ? {
          // Binds 0.0.0.0 so the runner can reach it, and reuses a preview that
          // is already up rather than fighting it for the port.
          command: `bun run web -- --port ${PORT}`,
          url: baseURL,
          reuseExistingServer: true,
          timeout: 180_000,
        }
      : undefined,
});
