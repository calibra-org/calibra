import { defineConfig, devices } from "@playwright/test";

/**
 * The admin is per-tenant (Phase 4): a bare-`localhost` host renders the "unknown shop" page, so
 * specs must run against a shop host (`<slug>.admin.localhost`). Default the base URL to Aurora's
 * admin and pin `NEXT_PUBLIC_ADMIN_ROOT` for the auto-started dev server so `*.admin.localhost`
 * resolves. Override `BASE_URL` (and `ADMIN_PORT`) to point at a spin.
 */
const PORT = process.env.ADMIN_PORT ?? "3001";
const ROOT = process.env.ADMIN_ROOT ?? "admin.localhost";
const BASE_URL = process.env.BASE_URL ?? `http://aurora.${ROOT}:${PORT}`;

export default defineConfig({
    testDir: "./tests/e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : undefined,
    reporter: process.env.CI ? "github" : "html",
    use: {
        baseURL: BASE_URL,
        trace: "on-first-retry",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: process.env.BASE_URL
        ? undefined
        : {
              command: "pnpm dev",
              url: `http://localhost:${PORT}`,
              env: { NEXT_PUBLIC_ADMIN_ROOT: ROOT },
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
          },
});
