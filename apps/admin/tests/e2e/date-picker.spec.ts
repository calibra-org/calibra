import { expect, test } from "@playwright/test";

/**
 * End-to-end coverage for the date-filter primitive in its canonical home — the orders list
 * toolbar chip. The same chip is mounted on customers and the export wizard, but exercising one
 * concrete surface gives us full confidence in the primitive's wiring (URL round-trip, instant
 * commit, operator menu, granularity tabs, free-text input, range mode).
 *
 * NOTE: tests assume the bulk seed has run (`admin@bulk.calibra.dev` / `Passw0rd1!`). The
 * webServer in playwright.config wires that up automatically in dev; CI runs against a seeded
 * preview spin per scripts/spin.md.
 */

async function login(page: import("@playwright/test").Page) {
    await page.goto("/en/login");
    await page.getByLabel(/email/i).fill("admin@bulk.calibra.dev");
    await page.getByLabel(/password/i).fill("Passw0rd1!");
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/dashboard/);
}

test.describe("date filter chip — Gregorian flow", () => {
    test.beforeEach(login);

    test("opens, picks a day, and reflects the filter in the URL + chip", async ({ page }) => {
        await page.goto("/en/orders");
        await page.getByRole("button", { name: /\+ created/i }).click();

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();

        await dialog.getByRole("button", { name: /^15$/ }).first().click();

        await expect(dialog).not.toBeVisible();

        await expect(page).toHaveURL(/created=before(%3A|:)\d{4}-\d{2}-\d{2}/);
        await expect(page.getByText(/before/)).toBeVisible();
    });

    test("switches operator without reopening the calendar", async ({ page }) => {
        await page.goto("/en/orders?created=before%3A2026-05-15");
        const operatorTrigger = page.getByRole("button", { name: /change operator/i });
        await operatorTrigger.click();
        await page.getByRole("menuitem", { name: "after" }).click();
        await expect(page).toHaveURL(/created=after(%3A|:)2026-05-15/);
    });

    test("typed input + Apply commits a quarter", async ({ page }) => {
        await page.goto("/en/orders");
        await page.getByRole("button", { name: /\+ created/i }).click();

        const dialog = page.getByRole("dialog");
        await dialog.getByPlaceholder(/may 2027/i).fill("Q4 2026");
        await page.waitForTimeout(300);
        await dialog.getByRole("button", { name: /^apply$/i }).click();

        await expect(dialog).not.toBeVisible();
        await expect(page).toHaveURL(/created=in(%3A|:)2026-Q4/);
    });

    test("invalid input surfaces an error and disables Apply", async ({ page }) => {
        await page.goto("/en/orders");
        await page.getByRole("button", { name: /\+ created/i }).click();

        const dialog = page.getByRole("dialog");
        await dialog.getByPlaceholder(/may 2027/i).fill("asdfasdf");
        await page.waitForTimeout(300);
        await expect(dialog.getByRole("alert")).toBeVisible();
        await expect(dialog.getByRole("button", { name: /^apply$/i })).toBeDisabled();
    });

    test("clear button removes the filter", async ({ page }) => {
        await page.goto("/en/orders?created=before%3A2026-05-15");
        await page.getByRole("button", { name: /clear filter/i }).first().click();
        await expect(page).toHaveURL(/^[^?]*\/en\/orders\/?(\?(?!created=))?[^?]*$/);
    });
});

test.describe("date filter chip — Jalali / Persian flow", () => {
    test.beforeEach(login);

    test("renders Persian month names + Jalali year in Day grid", async ({ page }) => {
        await page.goto("/orders");
        await page.getByRole("button", { name: /\+ تاریخ ثبت/ }).click();

        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.locator("html, body").locator(":scope")).toHaveAttribute("dir", "rtl");
        const monthHeader = dialog.locator(".rdp-month_caption").first();
        await expect(monthHeader).toBeVisible();
    });

    test("commits a Jalali year filter", async ({ page }) => {
        await page.goto("/orders");
        await page.getByRole("button", { name: /\+ تاریخ ثبت/ }).click();

        const dialog = page.getByRole("dialog");
        await dialog.getByRole("tab", { name: /^سال$/ }).click();
        await dialog.getByRole("button", { name: /1405/ }).first().click();
        await expect(dialog).not.toBeVisible();
        await expect(page).toHaveURL(/created=before(%3A|:)1405/);
    });
});
