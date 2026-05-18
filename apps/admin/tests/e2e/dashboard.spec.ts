import { expect, test } from "@playwright/test";

test("root redirects to dashboard in Persian by default", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "fa");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("english locale renders LTR", async ({ page }) => {
    await page.goto("/en/dashboard");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});
