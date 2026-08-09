import { expect, type Page, type Response, test } from "@playwright/test";

function requiredLoginCredential(name: "ADMIN_LOGIN_EMAIL" | "ADMIN_LOGIN_PASSWORD"): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} must be set before running admin E2E tests`);
    return value;
}

async function login(page: Page) {
    await page.goto("/login");
    if (!page.url().includes("/login")) return;
    await page.getByLabel(/ایمیل|email/i).fill(requiredLoginCredential("ADMIN_LOGIN_EMAIL"));
    await page.getByLabel(/رمز|password/i).fill(requiredLoginCredential("ADMIN_LOGIN_PASSWORD"));
    await page.getByRole("button", { name: /ورود|sign in|login/i }).click();
    await page.waitForURL(/\/dashboard|\/$/);
}

function trackFactorApiFailures(page: Page): () => string[] {
    const failures: string[] = [];
    page.on("response", (response: Response) => {
        const url = response.url();
        if (!url.includes("/api/admin/factor/")) return;
        if (response.status() >= 400) failures.push(`${response.status()} ${url}`);
    });
    return () => failures;
}

const FACTOR_PAGES = [
    ["/factor/documents", /فاکتورها و پیش.?فاکتورها/i],
    ["/factor/documents/new", /ساخت سند|سند جدید/i],
    ["/factor/payments", /پرداخت.?ها و درگاه.?ها/i],
    ["/factor/reports", /گزارش.?های فاکتور/i],
    ["/factor/records", /مشتریان و کاتالوگ/i],
    ["/factor/settings", /تنظیمات فاکتور/i],
] as const;

test.describe("admin factor module", () => {
    for (const [path, heading] of FACTOR_PAGES) {
        test(`${path} renders without factor API errors`, async ({ page }) => {
            const getFailures = trackFactorApiFailures(page);
            await login(page);
            await page.goto(path);
            await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
            await page.waitForLoadState("networkidle");
            await expect(page.getByText(/Internal Server Error|Unprocessable Entity|Unknown query parameter/i)).toHaveCount(0);
            expect(getFailures(), `factor API failures on ${path}`).toEqual([]);
        });
    }

    test("document list exposes accessible search, date, status and sort controls", async ({ page }) => {
        await login(page);
        await page.goto("/factor/documents");
        await expect(page.getByLabel("جستجو در اسناد")).toBeVisible();
        await expect(page.getByLabel("از تاریخ")).toBeVisible();
        await expect(page.getByLabel("تا تاریخ")).toBeVisible();
        await expect(page.getByLabel("فیلتر نوع سند")).toBeVisible();
        await expect(page.getByLabel("فیلتر وضعیت سند")).toBeVisible();
        await expect(page.getByLabel("مرتب‌سازی اسناد")).toBeVisible();
    });

    test("factor pages do not overflow a mobile viewport", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await login(page);
        for (const [path] of FACTOR_PAGES) {
            await page.goto(path);
            await page.waitForLoadState("networkidle");
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(1);
        }
    });

    test("factor menu expands under sales and exposes every requested destination", async ({ page }) => {
        await login(page);
        await page.goto("/dashboard");

        const factorToggle = page.getByRole("button", { name: /^فاکتور$|^Factor$/i });
        await expect(factorToggle).toBeVisible();
        if ((await factorToggle.getAttribute("aria-expanded")) !== "true") await factorToggle.click();

        for (const label of [
            /فاکتورها و پیش.?فاکتورها/i,
            /پرداخت.?ها و درگاه.?ها/i,
            /^گزارش.?ها$/i,
            /مشتریان و کاتالوگ/i,
            /^تنظیمات$/i,
        ]) {
            await expect(page.getByRole("link", { name: label })).toBeVisible();
        }
    });
});
