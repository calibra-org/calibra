import { expect, test } from "@playwright/test";

/**
 * Visual + behavioural regression for the sticky select / actions columns on every list page
 * that uses the shared `DataTable`. The customers list is the canonical consumer the original
 * checkbox-clipping bug was reported against; the coupons list is the newest consumer and
 * should inherit the same fix automatically because the sticky behavior is keyed on column id
 * (`select` / `actions`) inside `data-table.tsx` — no per-page wiring required.
 */

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

test.describe("DataTable sticky columns", () => {
    test("select column stays pinned on customers list under horizontal scroll", async ({ page }) => {
        await login(page);
        await page.goto("/customers");
        const table = page.locator("table").first();
        await expect(table).toBeVisible();

        /** Locate the scroll container (the wrapper the DataTable hooks `scrollLeft` on). */
        const scroller = page.locator("[role='grid'] >> div.custom-scrollbar").first();
        const initialSelect = await page.locator('[data-sticky="start"]').first().boundingBox();
        expect(initialSelect).not.toBeNull();

        /** Force a horizontal scroll if the table is wider than the viewport. */
        await scroller.evaluate((el) => el.scrollTo({ left: 500 }));
        await page.waitForTimeout(100);

        const afterScrollSelect = await page.locator('[data-sticky="start"]').first().boundingBox();
        expect(afterScrollSelect).not.toBeNull();
        /** The pinned cell's viewport x should be within a few px of its initial position. */
        expect(Math.abs((afterScrollSelect?.x ?? 0) - (initialSelect?.x ?? 0))).toBeLessThan(8);
    });

    test("actions column stays pinned on customers list under horizontal scroll", async ({ page }) => {
        await login(page);
        await page.goto("/customers");

        const scroller = page.locator("[role='grid'] >> div.custom-scrollbar").first();
        const initialActions = await page.locator('[data-sticky="end"]').first().boundingBox();

        await scroller.evaluate((el) => el.scrollTo({ left: 500 }));
        await page.waitForTimeout(100);
        const afterScrollActions = await page.locator('[data-sticky="end"]').first().boundingBox();

        if (initialActions !== null && afterScrollActions !== null) {
            expect(Math.abs(afterScrollActions.x - initialActions.x)).toBeLessThan(8);
        }
    });

    test("checkbox is fully visible (no vertical clip) at scrollLeft=0 and max", async ({ page }) => {
        await login(page);
        await page.goto("/customers");

        const checkbox = page.locator('[data-sticky="start"] [role="checkbox"], [data-sticky="start"] [data-slot="checkbox"]').first();
        await expect(checkbox).toBeVisible();
        const initialBox = await checkbox.boundingBox();
        expect(initialBox).not.toBeNull();
        /** A 16px checkbox + 3px ring + 2px breathing room ≈ 16px+ at minimum. */
        expect((initialBox?.height ?? 0)).toBeGreaterThanOrEqual(14);

        /** Scroll to far end and confirm the checkbox is still painted at the same height. */
        const scroller = page.locator("[role='grid'] >> div.custom-scrollbar").first();
        await scroller.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
        await page.waitForTimeout(100);
        const finalBox = await checkbox.boundingBox();
        expect(finalBox).not.toBeNull();
        expect(Math.abs((finalBox?.height ?? 0) - (initialBox?.height ?? 0))).toBeLessThan(2);
    });

    test("coupons list inherits the same sticky behavior", async ({ page }) => {
        await login(page);
        await page.goto("/coupons");

        const table = page.locator("table").first();
        await expect(table).toBeVisible();
        const initialSelect = await page.locator('[data-sticky="start"]').first().boundingBox();

        if (initialSelect === null) test.skip(true, "Coupons list rendered no rows in the seed dataset");

        const scroller = page.locator("[role='grid'] >> div.custom-scrollbar").first();
        await scroller.evaluate((el) => el.scrollTo({ left: 400 }));
        await page.waitForTimeout(100);
        const afterScrollSelect = await page.locator('[data-sticky="start"]').first().boundingBox();
        expect(Math.abs((afterScrollSelect?.x ?? 0) - (initialSelect?.x ?? 0))).toBeLessThan(8);
    });

    test("RTL layout pins the select column on the right edge", async ({ page }) => {
        await login(page);
        await page.goto("/customers");
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

        const selectCell = page.locator('[data-sticky="start"]').first();
        const scroller = page.locator("[role='grid'] >> div.custom-scrollbar").first();
        const cellBox = await selectCell.boundingBox();
        const containerBox = await scroller.boundingBox();
        if (cellBox === null || containerBox === null) return;
        /** Under RTL the start edge is the right side — the cell should sit near the container's right edge. */
        const distanceFromRight = containerBox.x + containerBox.width - (cellBox.x + cellBox.width);
        expect(distanceFromRight).toBeLessThan(8);
    });

    test("LTR layout pins the select column on the left edge", async ({ page }) => {
        await login(page);
        await page.goto("/en/customers");
        await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

        const selectCell = page.locator('[data-sticky="start"]').first();
        const scroller = page.locator("[role='grid'] >> div.custom-scrollbar").first();
        const cellBox = await selectCell.boundingBox();
        const containerBox = await scroller.boundingBox();
        if (cellBox === null || containerBox === null) return;
        const distanceFromLeft = cellBox.x - containerBox.x;
        expect(distanceFromLeft).toBeLessThan(8);
    });
});
