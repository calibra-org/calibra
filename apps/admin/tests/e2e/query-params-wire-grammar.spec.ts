import { expect, type Page, type Request, test } from "@playwright/test";

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

/** Sort a URLSearchParams into a stable, encoding-normalised `key=value` list for comparison. */
function normalize(params: URLSearchParams): string[] {
    const out: string[] = [];
    for (const [k, v] of params) out.push(`${k}=${v}`);
    return out.sort();
}

/**
 * The PR's headline contract: a pasted admin URL reproduces the byte-for-byte identical API
 * request. We deep-link to a list page with explicit wire-grammar params, capture the same-origin
 * proxy request the page issues, and assert its query string equals the address bar's — proving
 * there is no per-list conversion layer rewriting keys between the two.
 */
async function assertUrlEqualsRequest(page: Page, deepLink: string, resourcePath: string): Promise<Request> {
    const reqPromise = page.waitForRequest((req) => new URL(req.url()).pathname === resourcePath && req.method() === "GET");
    await page.goto(deepLink);
    const req = await reqPromise;

    const requestQs = normalize(new URL(req.url()).searchParams);
    const addressQs = normalize(new URL(page.url()).searchParams);
    expect(requestQs).toEqual(addressQs);

    /** The key-rename class is gone: a well-formed wire URL must never 422. */
    const res = await req.response();
    expect(res?.status(), `expected 2xx from ${resourcePath}, got ${res?.status()}`).toBeLessThan(400);
    return req;
}

test.describe("URL query params are 1:1 with the wire grammar", () => {
    test("products: address bar == request query (filter[]/sort[]/extras)", async ({ page }) => {
        await login(page);
        const link =
            "/products?" +
            [
                "filter[]=type:in:simple,variable",
                "filter[]=catalog_visibility:in:catalog",
                "filter[]=featured:eq:true",
                "sort[]=created_at:desc",
                "q=test",
                "stock_status=instock",
                "status=publish",
            ].join("&");
        const req = await assertUrlEqualsRequest(page, link, "/api/admin/products");

        const qs = new URL(req.url()).searchParams;
        /** No legacy / camelCase keys leaked onto the wire. */
        expect(qs.has("search")).toBe(false);
        expect(qs.has("sort")).toBe(false);
        expect(qs.has("stockStatus")).toBe(false);
        expect(qs.getAll("filter[]")).toContain("featured:eq:true");
    });

    test("coupons: address bar == request query (facets + toggles ride filter[])", async ({ page }) => {
        await login(page);
        const link =
            "/coupons?" +
            [
                "filter[]=discount_type:in:percent,fixed_cart",
                "filter[]=free_shipping:eq:true",
                "sort[]=created_at:desc",
                "q=WELCOME",
                "tab=active",
                "expiring_soon=true",
            ].join("&");
        const req = await assertUrlEqualsRequest(page, link, "/api/admin/coupons");

        const qs = new URL(req.url()).searchParams;
        expect(qs.has("search")).toBe(false);
        expect(qs.has("sort")).toBe(false);
        expect(qs.has("discount_type")).toBe(false);
        expect(qs.getAll("filter[]")).toContain("free_shipping:eq:true");
        expect(qs.get("expiring_soon")).toBe("true");
    });

    test("products: a status-tab click writes filter-grammar state, not a custom key", async ({ page }) => {
        await login(page);
        await page.goto("/products");
        await page.waitForLoadState("networkidle");

        const requestPromise = page.waitForRequest(
            (req) => new URL(req.url()).pathname === "/api/admin/products" && req.method() === "GET",
        );
        /** Click the Drafts tab; the page must encode it as the `status` extra, never a bespoke key. */
        await page.getByRole("tab", { name: /پیش‌نویس|draft/i }).click();
        const req = await requestPromise;

        const requestQs = normalize(new URL(req.url()).searchParams);
        const addressQs = normalize(new URL(page.url()).searchParams);
        expect(requestQs).toEqual(addressQs);
        expect(new URL(page.url()).searchParams.get("status")).toBe("draft");
    });
});
