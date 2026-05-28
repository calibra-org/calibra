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

/**
 * Record admin-API responses that carry the signatures of the bugs this PR fixes: a 422 (the
 * limit-cap / unknown-query-key class) or a 5xx (the q-search / slug server errors). The admin
 * client queries go through the same-origin proxy at `/api/admin/...`, so those statuses surface
 * here. Benign 401/404 from unrelated or not-yet-built endpoints are intentionally ignored so the
 * guard stays precise to the regressions rather than flaking on adjacent gaps.
 */
function trackAdminApiFailures(page: Page): () => string[] {
    const failures: string[] = [];
    page.on("response", (res: Response) => {
        const url = res.url();
        const status = res.status();
        if (url.includes("/api/admin/") && (status === 422 || status >= 500)) {
            failures.push(`${status} ${url}`);
        }
    });
    return () => failures;
}

/** List pages that consume a migrated TableView endpoint. The taxonomy + reviews + coupons +
 * media pages are the ones that regressed in PR #49 (limit cap, q/slug 500, malformed envelope,
 * search→q / facet param drift). */
const LIST_PAGES = [
    "/products",
    "/products/categories",
    "/products/tags",
    "/products/brands",
    "/products/attributes",
    "/products/reviews",
    "/orders",
    "/customers",
    "/coupons",
    "/media",
] as const;

test.describe("admin list pages render without backend errors", () => {
    for (const path of LIST_PAGES) {
        test(`${path} loads its table with no non-2xx admin API calls`, async ({ page }) => {
            const getFailures = trackAdminApiFailures(page);
            await login(page);
            await page.goto(path);

            await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

            /** No error-boundary / BackendError leakage on the page. */
            await expect(page.getByText(/Unprocessable Entity|Unknown query parameter/i)).toHaveCount(0);

            /** Give the client queries time to settle, then assert the network panel stayed clean. */
            await page.waitForLoadState("networkidle");
            expect(getFailures(), `admin API failures on ${path}`).toEqual([]);
        });
    }
});
