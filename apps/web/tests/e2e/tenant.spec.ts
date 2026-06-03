import { expect, test } from "@playwright/test";

/**
 * Multi-tenant storefront e2e (Phase 3). These run against a live stack with the demo tenants
 * seeded (`pnpm spin <slug> --with-web`), since tenant resolution + runtime branding only exist
 * end-to-end against the API. Point them at the spin:
 *
 *   BASE_URL=http://localhost:13823 STOREFRONT_PORT=13823 pnpm --filter @calibra/web test:e2e
 *
 * Chromium resolves `*.localhost` to loopback, so `aurora.shops.localhost:<port>` reaches the dev
 * server with the right `Host` for the middleware to resolve the tenant.
 */
const PORT = process.env.STOREFRONT_PORT ?? "13823";
const ROOT = process.env.SHOPS_ROOT ?? "shops.localhost";

const shop = (slug: string, path = "/"): string => `http://${slug}.${ROOT}:${PORT}${path}`;
const platform = (path = "/"): string => `http://localhost:${PORT}${path}`;

test.describe("storefront — multi-tenant rendering", () => {
    test("aurora renders the Aurora shop (Persian default, RTL)", async ({ page }) => {
        await page.goto(shop("aurora"));
        await expect(page).toHaveTitle(/Aurora/);
        await expect(page.locator("html")).toHaveAttribute("lang", "fa");
        await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
        await expect(page.getByRole("banner").getByText("Aurora")).toBeVisible();
    });

    test("mehr renders the Mehr shop — a different brand on a different host", async ({ page }) => {
        await page.goto(shop("mehr"));
        await expect(page).toHaveTitle(/Mehr/);
        await expect(page.getByRole("banner").getByText("Mehr")).toBeVisible();
        await expect(page.getByRole("banner").getByText("Aurora")).toHaveCount(0);
    });

    test("each tenant injects its own palette as CSS variables before paint", async ({ page }) => {
        const readAccent = () =>
            page.locator("html").evaluate((el) => getComputedStyle(el).getPropertyValue("--color-accent").trim());

        await page.goto(shop("aurora"));
        const auroraAccent = await readAccent();
        await page.goto(shop("mehr"));
        const mehrAccent = await readAccent();

        expect(auroraAccent).not.toBe("");
        expect(mehrAccent).not.toBe("");
        expect(auroraAccent).not.toBe(mehrAccent);
    });

    test("tenant catalog is scoped — Aurora and Mehr show different product counts", async ({ page }) => {
        await page.goto(shop("aurora", "/products"));
        const auroraCount = await page.locator("main ul > li").count();
        await page.goto(shop("mehr", "/products"));
        const mehrCount = await page.locator("main ul > li").count();

        expect(auroraCount).toBeGreaterThan(0);
        expect(mehrCount).toBeGreaterThan(0);
        expect(auroraCount).not.toBe(mehrCount);
    });

    test("locale toggle switches the same tenant to English LTR", async ({ page }) => {
        await page.goto(shop("aurora", "/en"));
        await expect(page.locator("html")).toHaveAttribute("lang", "en");
        await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
        await expect(page.getByRole("banner").getByText("Aurora")).toBeVisible();
    });
});

test.describe("storefront — platform states", () => {
    test("an unknown subdomain shows the platform shop-not-found page", async ({ page }) => {
        await page.goto(shop("no-such-shop-xyz"));
        await expect(page.getByRole("heading", { name: /shop not found/i })).toBeVisible();
    });

    test("the platform host (bare localhost) shows shop-not-found", async ({ page }) => {
        await page.goto(platform());
        await expect(page.getByRole("heading", { name: /shop not found/i })).toBeVisible();
    });
});
