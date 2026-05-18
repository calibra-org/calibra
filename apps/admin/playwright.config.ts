import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";

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
              url: BASE_URL,
              reuseExistingServer: !process.env.CI,
              timeout: 120_000,
          },
});
