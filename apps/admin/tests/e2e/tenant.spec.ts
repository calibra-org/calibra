import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

/**
 * Multi-tenant admin e2e (Phase 4). Runs against a live stack with the demo tenants seeded
 * (`pnpm spin <slug>`), since host→tenant resolution, tenant-scoped auth, branding, and the
 * impersonation banner only exist end-to-end against the API. Point it at the spin:
 *
 *   BASE_URL=http://aurora.admin.localhost:13654 ADMIN_PORT=13654 \
 *   ADMIN_API_BASE_URL=http://localhost:13653 pnpm --filter @calibra/admin test:e2e tenant
 *
 * Chromium resolves `*.localhost` to loopback, so `aurora.admin.localhost:<port>` reaches the dev
 * server with the right `Host` for the middleware to resolve the tenant. The dev server must run
 * with `NEXT_PUBLIC_ADMIN_ROOT=admin.localhost` (spin sets this).
 */
const PORT = process.env.ADMIN_PORT ?? "13654";
const ROOT = process.env.ADMIN_ROOT ?? "admin.localhost";
const API = process.env.ADMIN_API_BASE_URL ?? "http://localhost:13653";
const PASSWORD = process.env.ADMIN_LOGIN_PASSWORD ?? "Passw0rd1!";
const PLATFORM_EMAIL = process.env.PLATFORM_LOGIN_EMAIL ?? "platform@calibra.dev";

const shop = (slug: string, path = "/"): string => `http://${slug}.${ROOT}:${PORT}${path}`;
const apex = (path = "/"): string => `http://localhost:${PORT}${path}`;

const SESSION_COOKIE = "admin_session";

async function login(page: Page, slug: string, email: string) {
    await page.goto(shop(slug, "/login"));
    await page.getByLabel(/ایمیل|email/i).fill(email);
    await page.getByLabel(/رمز|password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /ورود|sign in|login/i }).click();
    await page.waitForURL(/\/dashboard\/?$/);
}

test.describe("admin — multi-tenant host resolution", () => {
    test("the apex host (no shop) renders the platform 'unknown shop' page", async ({ page }) => {
        await page.goto(apex("/"));
        await expect(page).toHaveTitle(/ناشناخته|Unknown shop/i);
        await expect(page.getByRole("textbox")).toHaveCount(0);
    });

    test("aurora's admin logs in and reaches the dashboard", async ({ page }) => {
        await login(page, "aurora", "admin@bulk.calibra.dev");
        await expect(page).toHaveURL(/aurora\..*\/dashboard/);
        await expect(page.getByText(/ناشناخته|Unknown shop/i)).toHaveCount(0);
    });

    test("mehr's admin logs in on its own host", async ({ page }) => {
        await login(page, "mehr", "admin@mehr.calibra.dev");
        await expect(page).toHaveURL(/mehr\..*\/dashboard/);
    });

    test("an Aurora session is rejected on the Mehr host (RULE A)", async ({ page, context }) => {
        await login(page, "aurora", "admin@bulk.calibra.dev");
        const cookies = await context.cookies();
        const session = cookies.find((c) => c.name === SESSION_COOKIE);
        expect(session).toBeTruthy();

        /** Carry the Aurora session onto the Mehr host — the session's tenant no longer matches. */
        await context.addCookies([{ name: SESSION_COOKIE, value: session?.value ?? "", url: shop("mehr") }]);
        await page.goto(shop("mehr", "/dashboard"));
        await expect(page).toHaveURL(/mehr\..*\/login/);
    });
});

test.describe("admin — branding self-serve", () => {
    test("editing the accent color saves and persists", async ({ page }) => {
        await login(page, "aurora", "admin@bulk.calibra.dev");
        await page.goto(shop("aurora", "/branding"));

        const accent = page.getByTestId("branding-color-accent");
        await expect(accent).toBeVisible();
        const next = "oklch(52% 0.2 320)";
        await accent.fill(next);
        await page.getByTestId("branding-save").click();

        /** Reload and confirm the new value round-tripped through the API. */
        await page.goto(shop("aurora", "/branding"));
        await expect(page.getByTestId("branding-color-accent")).toHaveValue(next);

        /** Restore the seeded accent so the test is idempotent across runs. */
        await page.getByTestId("branding-color-accent").fill("oklch(60% 0.16 230)");
        await page.getByTestId("branding-save").click();
    });
});

/** Mint a real impersonation token for `aurora` through the platform API (Phase 1 flow). */
async function mintImpersonation(request: APIRequestContext): Promise<{ token: string; userId: number; email: string }> {
    const login = await request.post(`${API}/api/v1/platform/auth/login`, {
        data: { email: PLATFORM_EMAIL, password: PASSWORD },
    });
    const platformToken = (await login.json()).token.value as string;

    const grant = await request.post(`${API}/api/v1/platform/tenants/1/impersonate`, {
        headers: { authorization: `Bearer ${platformToken}` },
        data: {},
    });
    const token = (await grant.json()).data.token.value as string;

    const me = await request.get(`${API}/api/v1/auth/me`, {
        headers: { authorization: `Bearer ${token}`, "x-calibra-tenant": "aurora" },
    });
    const body = await me.json();
    return { token, userId: Number(body.user.id), email: body.user.email ?? "support@calibra.dev" };
}

test.describe("admin — impersonation banner", () => {
    test("shows the banner for an impersonation session and exits", async ({ page, context, request }) => {
        const { token, userId, email } = await mintImpersonation(request);

        /** Inject the impersonation session the way `loginAction` would (host-scoped, tenant=aurora). */
        const session = JSON.stringify({ token, userId, email, displayName: email, tenantSlug: "aurora" });
        await context.addCookies([{ name: SESSION_COOKIE, value: session, url: shop("aurora") }]);

        await page.goto(shop("aurora", "/dashboard"));
        const banner = page.getByRole("alert");
        await expect(banner).toBeVisible();
        await expect(banner.getByText(/aurora/i)).toBeVisible();

        await banner.getByRole("button", { name: /خروج|exit/i }).click();
        /** Exit revokes the token and leaves the impersonated dashboard. */
        await expect(page).not.toHaveURL(/aurora\..*\/dashboard/);
    });
});
