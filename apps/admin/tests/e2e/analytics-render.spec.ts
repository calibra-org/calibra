import { expect, type Page, type Response, test } from "@playwright/test";

const LOGIN_EMAIL = process.env.ADMIN_LOGIN_EMAIL ?? "admin@bulk.calibra.dev";
const LOGIN_PASSWORD = process.env.ADMIN_LOGIN_PASSWORD ?? "Passw0rd1!";

async function login(page: Page) {
    await page.goto("/login");
    if (!page.url().includes("/login")) return;
    await page.getByLabel(/ایمیل|email/i).fill(LOGIN_EMAIL);
    await page.getByLabel(/رمز|password/i).fill(LOGIN_PASSWORD);
    await page.getByRole("button", { name: /ورود|sign in|login/i }).click();
    await page.waitForURL(/\/dashboard|\/$/);
}

function trackAdminApiFailures(page: Page): () => string[] {
    const failures: string[] = [];
    page.on("response", (res: Response) => {
        const url = res.url();
        const status = res.status();
        if (url.includes("/api/admin/") && status >= 400) failures.push(`${status} ${url}`);
    });
    return () => failures;
}

const ANALYTICS_PAGES = [
    "/analytics",
    "/analytics/revenue",
    "/analytics/orders",
    "/analytics/products",
    "/analytics/categories",
    "/analytics/coupons",
    "/analytics/taxes",
    "/analytics/stock",
] as const;

test.describe("admin analytics pages render without backend errors", () => {
    for (const path of ANALYTICS_PAGES) {
        test(`${path} renders + makes only 2xx report calls`, async ({ page }) => {
            const getFailures = trackAdminApiFailures(page);
            await login(page);
            await page.goto(path);

            await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
            await expect(page.getByText(/Unprocessable Entity|Unknown query parameter|Internal Server/i)).toHaveCount(0);

            await page.waitForLoadState("networkidle");
            expect(getFailures(), `admin API failures on ${path}`).toEqual([]);
        });
    }

    test("captures overview + revenue screenshots", async ({ page }) => {
        await login(page);
        await page.goto("/analytics");
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: "/tmp/analytics-overview-fa.png", fullPage: true });
        await page.goto("/en/analytics/revenue");
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: "/tmp/analytics-revenue-en.png", fullPage: true });
    });
});
