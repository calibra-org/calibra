import { expect, test } from "@playwright/test";

test("home page renders English LTR by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("persian locale renders RTL", async ({ page }) => {
    await page.goto("/fa");
    await expect(page.locator("html")).toHaveAttribute("lang", "fa");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});
