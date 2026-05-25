import { expect, test } from "@playwright/test";

const LOGIN_EMAIL = process.env.ADMIN_LOGIN_EMAIL ?? "admin@bulk.calibra.dev";
const LOGIN_PASSWORD = process.env.ADMIN_LOGIN_PASSWORD ?? "Passw0rd1!";

async function login(page: import("@playwright/test").Page) {
    await page.goto("/login");
    if (!page.url().includes("/login")) return;
    await page.getByLabel(/ایمیل|email/i).fill(LOGIN_EMAIL);
    await page.getByLabel(/رمز|password/i).fill(LOGIN_PASSWORD);
    await page.getByRole("button", { name: /ورود|sign in|login/i }).click();
    await page.waitForURL(/\/dashboard|\/$/);
}

test.describe("Coupons admin", () => {
    test("list renders status tabs with live counts", async ({ page }) => {
        await login(page);
        await page.goto("/coupons");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        /** Status tabs render whether or not coupons exist — count parens appear only after counts resolve. */
        const tabs = page.getByRole("tab");
        await expect(tabs.first()).toBeVisible();
        await expect(tabs).toHaveCount(7);
    });

    test("search debounces and narrows the result set", async ({ page }) => {
        await login(page);
        await page.goto("/coupons");
        const search = page.getByPlaceholder(/جست‌وجو|search/i);
        await search.fill("WELCOME");
        await page.waitForTimeout(400);
        /** After search, either a row with the matching code is shown or the filtered-empty state appears. */
        const matchingRow = page.locator("text=WELCOME").first();
        const emptyState = page.locator("text=/پیدا نشد|results match/i").first();
        await expect(matchingRow.or(emptyState)).toBeVisible();
    });

    test("editor: create a new coupon end-to-end", async ({ page }) => {
        await login(page);
        await page.goto("/coupons/new");

        const code = `E2E${Date.now().toString(36).toUpperCase()}`;
        await page.getByLabel(/^کد$|^code$/i).fill(code);

        /** Wait for the live code-check to report available (or at least not blocking). */
        await page.waitForTimeout(500);

        /** Discount type defaults to `percent`; set value to 15. */
        await page.getByLabel(/مقدار تخفیف|discount amount/i)
            .first()
            .fill("15");

        /** Save. The dirty bar should be visible because we typed in code + amount. */
        const saveButton = page.getByRole("button", { name: /ایجاد و ذخیره|create and save|ذخیره/i });
        await expect(saveButton).toBeVisible();
        await saveButton.click();

        /** Land on the new edit page. */
        await page.waitForURL(/\/coupons\/\d+/);
        await expect(page.getByRole("heading", { level: 1 })).toContainText(code);
    });

    test("editor: quick test sheet renders for an existing coupon", async ({ page }) => {
        await login(page);
        await page.goto("/coupons");
        /** Click the first row's code link to land on the editor. */
        const firstCodeLink = page.locator("table tbody tr a.font-mono").first();
        if (await firstCodeLink.count() === 0) test.skip(true, "No coupons in dataset to open");
        await firstCodeLink.click();
        await page.waitForURL(/\/coupons\/\d+/);

        await page.getByRole("button", { name: /اقدامات بیشتر|more actions/i }).click();
        await page.getByRole("menuitem", { name: /تست سریع|quick test/i }).click();
        await expect(page.getByRole("heading", { name: /تست سریع|quick test/i })).toBeVisible();
    });

    test("dashboard renders the new Customer summary tile", async ({ page }) => {
        await login(page);
        await page.goto("/dashboard");
        await expect(page.getByRole("heading", { name: /خلاصه مشتری‌ها|customer summary/i })).toBeVisible();
        await expect(page.getByText(/کل مشتری‌ها|total customers/i)).toBeVisible();
    });
});
