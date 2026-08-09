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

function trackContentApiFailures(page: Page): () => string[] {
    const failures: string[] = [];
    page.on("response", (response: Response) => {
        const url = response.url();
        if (!url.includes("/api/admin/content/")) return;
        if (response.status() >= 400) failures.push(`${response.status()} ${url}`);
    });
    return () => failures;
}

const CONTENT_PAGES = [
    ["/content/posts", /مدیریت نوشته.?ها|Post management/i],
    ["/content/market-radar", /اخبار و رصد بازار|market radar/i],
    ["/content/agents", /مرکز فرمان Agent|Agent command center/i],
    ["/content/studio", /استودیو محتوا و AI|Content & AI studio/i],
    ["/content/calendar", /تقویم و انتشار|Calendar & publishing/i],
    ["/content/taxonomy", /دسته.?ها و برچسب.?ها|Categories & tags/i],
    ["/content/reports", /تحلیل و گزارش.?ها|Analytics & reports/i],
    ["/content/settings", /تنظیمات نوشته.?ها|Content settings/i],
] as const;

test.describe("admin content operations module", () => {
    for (const [path, heading] of CONTENT_PAGES) {
        test(`${path} renders without content API errors`, async ({ page }) => {
            const failures = trackContentApiFailures(page);
            await login(page);
            await page.goto(path);
            await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
            await page.waitForLoadState("networkidle");
            await expect(page.getByText(/Internal Server Error|Unprocessable Entity|Unknown query parameter/i)).toHaveCount(0);
            expect(failures(), `content API failures on ${path}`).toEqual([]);
        });
    }

    test("content menu is collapsible below factor and preserves the requested order", async ({ page }) => {
        await login(page);
        await page.goto("/dashboard");
        const toggle = page.getByRole("button", { name: /^نوشته.?ها$|^Content$/i });
        await expect(toggle).toBeVisible();
        if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
        const labels = [
            /مدیریت نوشته.?ها|Post management/i,
            /اخبار و رصد بازار|market radar/i,
            /مرکز فرمان Agent|Agent command center/i,
            /استودیو محتوا و AI|Content & AI studio/i,
            /تقویم و انتشار|Calendar & publishing/i,
            /رسانه و فایل.?ها|Media & files/i,
            /دسته.?ها و برچسب.?ها|Categories & tags/i,
            /تحلیل و گزارش.?ها|Analytics & reports/i,
            /^تنظیمات$|^Settings$/i,
        ];
        const links = toggle.locator("xpath=following-sibling::*[1]").getByRole("link");
        await expect(links).toHaveCount(labels.length);
        for (let index = 0; index < labels.length; index += 1) {
            await expect(links.nth(index)).toHaveAccessibleName(labels[index]);
        }
    });

    test("media route reuses Calibra media management without horizontal page overflow", async ({ page }) => {
        await login(page);
        await page.goto("/content/media");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        expect(overflow).toBe(false);
    });
});
